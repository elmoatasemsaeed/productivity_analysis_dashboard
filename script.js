// 1. Global Variables (Top Level Scope)
let rawData = [];
let processedStories = [];
let holidays = JSON.parse(localStorage.getItem('holidays') || "[]");
let githubToken = localStorage.getItem('gh_token') || ""; 

// GitHub Configuration
const GH_CONFIG = {
    owner: 'elmoatasemsaeed',
    repo: 'Productivity_Analysis_Dashboard',
    path: 'data.json',
    usersPath: 'users.json', // مسار ملف المستخدمين الجديد
    branch: 'main'
};

// Initialize Users
let users = JSON.parse(localStorage.getItem('app_users'));
if (!users || Object.keys(users).length === 0) {
    users = {
        "admin": { pass: "admin", role: "admin" } // Changed role to 'admin' to match setupPermissions logic
    };
    localStorage.setItem('app_users', JSON.stringify(users));
}

let currentUser = null;

// --- Functions ---

function saveUsers() {
    localStorage.setItem('app_users', JSON.stringify(users));
    renderUsersTable(); 
}

async function attemptLogin() {
    const user = document.getElementById('loginUser').value;
    const pass = document.getElementById('loginPass').value;
    const token = document.getElementById('ghTokenInput').value;
    const azurePat = document.getElementById('azurePatInput').value;
    const remember = document.getElementById('rememberMe').checked;

    if (users[user] && users[user].pass === pass) {
        currentUser = { name: user, ...users[user] };
        
        // حفظ البيانات إذا تم اختيار "تذكرني"
        if (remember) {
            localStorage.setItem('gh_token', token);
            localStorage.setItem('azure_pat', azurePat); // حفظ Azure PAT
            localStorage.setItem('saved_user', user);
            localStorage.setItem('saved_pass', pass);
            localStorage.setItem('app_role', currentUser.role);
        } else {
            // مسح البيانات القديمة إذا لم يتم اختيار "تذكرني"
            localStorage.removeItem('gh_token');
            localStorage.removeItem('azure_pat');
            localStorage.removeItem('saved_user');
            localStorage.removeItem('saved_pass');
        }

        githubToken = token; // تحديث المتغير العام بالتوكن الحالي
        setupPermissions();
        document.getElementById('login-overlay').style.display = 'none';
    } else {
        alert("Invalid credentials");
    }
}
function renderUsersTable() {
    const tbody = document.getElementById('usersListTable');
    if (!tbody || !users) return;
    
    tbody.innerHTML = Object.keys(users).map(u => `
        <tr>
            <td>${u}</td>
            <td>${users[u].pass}</td>
            <td>${users[u].role}</td>
            <td>
                <button onclick="deleteUser('${u}')" style="background:#e74c3c; padding:5px; color:white; border:none; border-radius:3px;">Delete</button>
            </td>
        </tr>
    `).join('');
}


async function addUser() {
    const name = document.getElementById('newUserName').value;
    const pass = document.getElementById('newUserPass').value;
    const role = document.getElementById('newUserRole').value;

    if (name && pass) {
        users[name] = { pass: pass, role: role };
        // حفظ محلي مؤقت
        localStorage.setItem('app_users', JSON.stringify(users)); 
        
        // رفع القائمة المحدثة إلى GitHub
        await uploadUsersToGitHub(); 
        
        alert("User saved and synced to GitHub!");
        document.getElementById('newUserName').value = '';
        document.getElementById('newUserPass').value = '';
        renderUsersTable();
    }
}

// جلب المستخدمين من GitHub عند تشغيل النظام
async function fetchUsersFromGitHub() {
    try {
        const res = await fetch(`https://api.github.com/repos/${GH_CONFIG.owner}/${GH_CONFIG.repo}/contents/${GH_CONFIG.usersPath}`, {
            headers: { 
                'Authorization': `token ${githubToken}`,
                'Accept': 'application/vnd.github.v3.raw'
            }
        });

        if (res.ok) {
            const content = await res.text();
            users = JSON.parse(content);
            localStorage.setItem('app_users', JSON.stringify(users));
            renderUsersTable();
        }
    } catch (e) {
        console.error("Error fetching users:", e);
    }
}

async function uploadUsersToGitHub() { // تم إضافة القوس هنا
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(users))));

    let sha = "";

    try {
        const res = await fetch(`https://api.github.com/repos/${GH_CONFIG.owner}/${GH_CONFIG.repo}/contents/${GH_CONFIG.usersPath}`, {
            headers: { 'Authorization': `token ${githubToken}` }
        });
        if (res.ok) {
            const data = await res.json();
            sha = data.sha;
        }

        await fetch(`https://api.github.com/repos/${GH_CONFIG.owner}/${GH_CONFIG.repo}/contents/${GH_CONFIG.usersPath}`, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${githubToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: "Update user list",
                content: content,
                sha: sha,
                branch: GH_CONFIG.branch
            })
        });
    } catch (e) {
        console.error("Error syncing users:", e);
    }
}
function deleteUser(username) {
    if (username === 'admin') return alert("Cannot delete main admin!");
    if (confirm(`Delete user ${username}?`)) {
        delete users[username];
        saveUsers();
    }
}

// 3. التحكم في ما يظهر للمستخدم
function setupPermissions() {
    // جلب الرتبة من localStorage أو من كائن المستخدم الحالي
    const role = localStorage.getItem('app_role') || (currentUser ? currentUser.role : null);
    const adminElements = document.querySelectorAll('.admin-only');
    
    adminElements.forEach(el => {
        // إذا كان المستخدم admin اجعل العنصر يظهر، وإلا أخفه تماماً
        if (role === 'admin') {
            el.style.setProperty('display', 'inline-block', 'important');
        } else {
            el.style.setProperty('display', 'none', 'important');
        }
    });
}

// 4. دالة جلب البيانات من GitHub (تحديث للدالة الحالية)
async function fetchDataFromGitHub() {
    const statusDiv = document.getElementById('sync-status');
    statusDiv.style.display = 'block';
    statusDiv.innerText = "🔍 Fetching data from GitHub...";

    try {
        const res = await fetch(`https://api.github.com/repos/${GH_CONFIG.owner}/${GH_CONFIG.repo}/contents/${GH_CONFIG.path}`, {
            headers: { 
                'Authorization': `token ${githubToken}`,
                'Accept': 'application/vnd.github.v3.raw' // هذا التعديل يسمح بجلب ملفات حتى 100 ميجا
            }
        });

        if (res.ok) {
            // نستخدم res.text() بدلاً من res.json() لأن البيانات قادمة كـ string خام
            const content = await res.text();
            rawData = JSON.parse(content);
            updateIterationDropdown();
            processData(); 
            await loadConfigsFromCloud();
            if (typeof renderAzureConfigsTable === 'function') {
                renderAzureConfigsTable();
            }
            showView('iteration-view');
            statusDiv.innerText = "✅ Data loaded from GitHub";
        } else {
            statusDiv.innerText = "❌ No data found on GitHub. Admin must upload first.";
        }
    } catch (e) {
        console.error(e);
        statusDiv.innerText = "❌ Connection Error";
    }
}

// 5. تسجيل الخروج
// 5. تسجيل الخروج
function logout() { // تم تصحيح الكلمة هنا
    // نمسح فقط بيانات الجلسة الحالية
    localStorage.removeItem('gh_token');
    localStorage.removeItem('app_role');
    localStorage.removeItem('saved_user');
    localStorage.removeItem('saved_pass');
    location.reload();
}

// تحديث window.onload
window.onload = async () => {
    // 1. استرجاع القيم
    const savedUser = localStorage.getItem('saved_user');
    const savedPass = localStorage.getItem('saved_pass');
    const savedGhToken = localStorage.getItem('gh_token');
    const savedAzurePat = localStorage.getItem('azure_pat');
    const savedRole = localStorage.getItem('app_role');

    // 2. تعبئة الحقول
    if (savedUser) document.getElementById('loginUser').value = savedUser;
    if (savedPass) document.getElementById('loginPass').value = savedPass;
    if (savedGhToken) document.getElementById('ghTokenInput').value = savedGhToken;
    if (savedAzurePat) document.getElementById('azurePatInput').value = savedAzurePat;

    // 3. الدخول التلقائي
    if (savedGhToken && savedRole && savedUser) {
        githubToken = savedGhToken; 
        
        document.getElementById('login-overlay').style.display = 'none';
        if (document.getElementById('main-nav')) {
            document.getElementById('main-nav').style.display = 'flex';
        }

        currentUser = { name: savedUser, role: savedRole };
        setupPermissions();
        await fetchDataFromGitHub();
    }

    // 4. استدعاء الجدول مباشرة هنا بدلاً من إضافة Event Listener جديد
    if (typeof renderAzureConfigsTable === 'function') {
        renderAzureConfigsTable();
    }
}; // إغلاق window.onload

function renderHolidays() {
    const list = document.getElementById('holidaysList');
    if (list) {
        list.innerHTML = holidays.map(h => `<li>${h} <button onclick="removeHoliday('${h}')">X</button></li>`).join('');
    }
}

function removeHoliday(date) {
    holidays = holidays.filter(h => h !== date);
    localStorage.setItem('holidays', JSON.stringify(holidays));
    renderHolidays();
}

// Handle Upload
// Handle Upload
// البحث عن هذه الدالة في ملف script.js وتعديل السطر المشار إليه
async function handleUpload() {
    const file = document.getElementById('csvFile').files[0];
    
    if (!githubToken) {
        return alert("GitHub Token is missing. Please log in again.");
    }

    if (!file) return alert("Please select a file first");

    localStorage.setItem('gh_token', githubToken); 

    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async function(results) {
            rawData = results.data;
            processData(); 
            // التعديل هنا: تمرير rawData كمعامل للدالة
            await uploadToGitHub(rawData); 
            await loadConfigsFromCloud();
            showView('iteration-view');
        }
    });
}

async function uploadToGitHub(jsonData) {
    if (!jsonData) {
        console.error("No data provided to uploadToGitHub");
        return;
    }

    const statusDiv = document.getElementById('sync-status');
    statusDiv.style.display = 'block';
    statusDiv.innerText = "⏳ Syncing with GitHub...";

    try {
        const headers = { 
            'Authorization': `token ${githubToken}`, 
            'Content-Type': 'application/json' 
        };

        // 1. جلب الـ SHA الخاص بالفرع
        const branchRes = await fetch(`https://api.github.com/repos/${GH_CONFIG.owner}/${GH_CONFIG.repo}/branches/${GH_CONFIG.branch}`, { headers });
        if (!branchRes.ok) throw new Error(`Branch fetch failed: ${branchRes.statusText}`);
        const branchData = await branchRes.json();
        const lastCommitSha = branchData.commit.sha;

        // 2. إنشاء الـ Blob
        const blobRes = await fetch(`https://api.github.com/repos/${GH_CONFIG.owner}/${GH_CONFIG.repo}/git/blobs`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                content: JSON.stringify(jsonData, null, 2),
                encoding: 'utf-8'
            })
        });
        if (!blobRes.ok) throw new Error(`Blob creation failed: ${await blobRes.text()}`);
        const blobData = await blobRes.json();

        // 3. إنشاء الـ Tree
        const treeRes = await fetch(`https://api.github.com/repos/${GH_CONFIG.owner}/${GH_CONFIG.repo}/git/trees`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                base_tree: branchData.commit.commit.tree.sha,
                tree: [{
                    path: GH_CONFIG.path,
                    mode: '100644',
                    type: 'blob',
                    sha: blobData.sha
                }]
            })
        });
        if (!treeRes.ok) throw new Error(`Tree creation failed: ${await treeRes.text()}`);
        const treeData = await treeRes.json();

        // 4. إنشاء الـ Commit
        const commitRes = await fetch(`https://api.github.com/repos/${GH_CONFIG.owner}/${GH_CONFIG.repo}/git/commits`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                message: `Auto-update data.json - ${new Date().toLocaleString()}`,
                tree: treeData.sha,
                parents: [lastCommitSha]
            })
        });
        if (!commitRes.ok) throw new Error(`Commit failed: ${await commitRes.statusText}`);
        const commitData = await commitRes.json();

        // 5. تحديث مرجع الفرع
        const refRes = await fetch(`https://api.github.com/repos/${GH_CONFIG.owner}/${GH_CONFIG.repo}/git/refs/heads/${GH_CONFIG.branch}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ 
        sha: commitData.sha,
        force: true // هذا السطر يحل مشكلة الـ 422 في تحديث المراجع
    })
});
        if (!refRes.ok) throw new Error(`Reference update failed: ${await refRes.statusText}`);

        statusDiv.innerText = "✅ Synced Successfully!";
        setTimeout(() => statusDiv.style.display = 'none', 3000);

    } catch (e) {
        console.error("GitHub Sync Detailed Error:", e);
        statusDiv.innerText = "❌ Sync Error: Check Console";
    }
}

// Data Processing
function processData() {
    processedStories = [];
    let currentStory = null;

    rawData.forEach(row => {
        const type = row['Work Item Type'];
        
        if (type === 'User Story') {
            currentStory = {
                id: row['ID'],
                title: row['Title'],
                businessArea: row['Business Area'] || 'General',
                devLead: row['Assigned To'],
                testerLead: row['Assigned To Tester'],
                testedDate: row['Tested Date'],
                activatedDate: row['Activated Date'],
                status: row['State'],
                tasks: [],
                bugs: [],
                reviews: []
            };
            processedStories.push(currentStory);
        } else if (currentStory) {
            if (type === 'Task') currentStory.tasks.push(row);
            if (type === 'Bug') currentStory.bugs.push(row);
            if (type === 'Review') currentStory.reviews.push(row);
        }
    });

    calculateMetrics();
}

function calculateMetrics() {
    processedStories.forEach(us => {
        let devOrig = 0, devActual = 0, testOrig = 0, testActual = 0;
        let dbOrig = 0, dbActual = 0, dbNames = new Set(); 

        // 1. حساب مهام الـ Tasks (Development, Testing, DB)
        us.tasks.forEach(t => {
            const orig = parseFloat(t['Original Estimation']) || 0;
            const actDev = parseFloat(t['TimeSheet_DevActualTime']) || 0; 
            const actTest = parseFloat(t['TimeSheet_TestingActualTime']) || 0;
            const activity = t['Activity'];

            if (activity === 'DB Modification') {
                dbOrig += orig;
                dbActual += actDev; 
                if (t['Assigned To']) dbNames.add(t['Assigned To']); 
            } else if (activity === 'Development') {
                devOrig += orig;
                devActual += actDev;
            } else if (activity === 'Testing') {
                testOrig += orig;
                testActual += actTest;
            }
        });

        // تخزين بيانات الـ DB والـ Effort الأساسي
        us.dbEffort = { 
            orig: dbOrig, 
            actual: dbActual, 
            dev: dbOrig / (dbActual || 1),
            names: Array.from(dbNames).join(', ') || 'N/A'
        };
        us.devEffort = { orig: devOrig, actual: devActual, dev: devOrig / (devActual || 1) };
        us.testEffort = { orig: testOrig, actual: testActual, dev: testOrig / (testActual || 1) };

        let bugOrig = 0, bugActualTotal = 0, bugsNoTimesheet = 0;
        us.severityCounts = { critical: 0, high: 0, medium: 0, low: 0 };

        // تعريف الهيكل وتصفير عدادات الحقل الجديد UAT و Iteration Bugs
        us.rework = {
            generic: { count: 0, actualTime: 0, severity: { critical: 0, high: 0, medium: 0, low: 0 } },
            specific: { count: 0, actualTime: 0, severity: { critical: 0, high: 0, medium: 0, low: 0 } },
            severity: { critical: 0, high: 0, medium: 0, low: 0 }, 
            timeEstimation: 0,
            actualTime: 0,
            count: 0,
            uatBugsCount: 0,        // عداد بجز الـ UAT للـ User Story
            iterationBugsCount: 0   // عداد بجز الـ Iteration للـ User Story
        };

        us.bugs.forEach(b => {
            const isGeneric = (b['GenericBug'] || "").trim().toLowerCase() === 'yes';
            const bDevAct = parseFloat(b['TimeSheet_DevActualTime']) || 0;
            const bEst = parseFloat(b['Original Estimation']) || 0;
            const sev = b['Severity'] || "";
            const bugType = (b['Bug Type'] || "").trim().toUpperCase(); // قراءة العمود الجديد

            // تصنيف وتحديد البجز بناءً على الـ Bug Type
            if (bugType === 'UAT') {
                us.rework.uatBugsCount++;
            } else {
                us.rework.iterationBugsCount++;
            }

            bugOrig += bEst;
            bugActualTotal += bDevAct;
            if (bDevAct === 0) bugsNoTimesheet++;

            const target = isGeneric ? us.rework.generic : us.rework.specific;
            target.count++;
            target.actualTime += bDevAct;

            if (sev.includes("1 - Critical")) { 
                target.severity.critical++; 
                us.rework.severity.critical++; 
                us.severityCounts.critical++; 
            }
            else if (sev.includes("2 - High")) { 
                target.severity.high++; 
                us.rework.severity.high++; 
                us.severityCounts.high++; 
            }
            else if (sev.includes("3 - Medium")) { 
                target.severity.medium++; 
                us.rework.severity.medium++; 
                us.severityCounts.medium++; 
            }
            else if (sev.includes("4 - Low")) { 
                target.severity.low++; 
                us.rework.severity.low++; 
                us.severityCounts.low++; 
            }
        });

        // تحديث البيانات النهائية للـ Rework
        us.rework.timeEstimation = bugOrig;
        us.rework.actualTime = bugActualTotal;
        us.rework.count = us.bugs.length;
        us.rework.missingTimesheet = bugsNoTimesheet;
        us.rework.deviation = bugOrig / (bugActualTotal || 1);
        us.rework.percentage = (bugActualTotal / (us.devEffort.actual || 1)) * 100;
        

        // 3. حساب الـ Review 
        us.reviewStats = {
            estimation: 0,
            devActual: 0, 
            testActual: 0,
            totalActual: 0, 
            devCount: 0,
            testCount: 0,
            count: us.reviews ? us.reviews.length : 0,
            severity: { critical: 0, high: 0, medium: 0, low: 0}
        };

        if (us.reviews) {
            us.reviews.forEach(r => {
                const rEst = parseFloat(r['Original Estimation']) || 0;
                const rDevAct = parseFloat(r['TimeSheet_DevActualTime']) || 0;
                const rTestAct = parseFloat(r['TimeSheet_TestingActualTime']) || 0;
                const activity = r['Activity'];
                const sev = r['Severity'] || "";

                us.reviewStats.estimation += rEst;

                if (activity === 'Development') {
                    us.reviewStats.devActual += rDevAct;
                    us.reviewStats.devCount++;
                } else if (activity === 'Testing') {
                    us.reviewStats.testActual += rTestAct;
                    us.reviewStats.testCount++;
                }

                if (sev.includes("1 - Critical")) us.reviewStats.severity.critical++;
                else if (sev.includes("2 - High")) us.reviewStats.severity.high++;
                else if (sev.includes("3 - Medium")) us.reviewStats.severity.medium++;
                else if (sev.includes("4 - Low")) us.reviewStats.severity.low++;
            });

            us.reviewStats.totalActual = us.reviewStats.devActual + us.reviewStats.testActual;
        }

        // 4. حساب التوقيت والـ Cycle Time
        let minDate = Infinity;
        us.tasks.forEach(t => {
            const taskDate = new Date(t['Activated Date']).getTime();
            if (!isNaN(taskDate) && taskDate < minDate) minDate = taskDate;
        });

        const firstTaskStart = minDate === Infinity ? null : new Date(minDate);
        const storyEndDate = us.testedDate ? new Date(us.testedDate) : null;
        us.cycleTime = calculateCycleTimeDays(firstTaskStart, storyEndDate);

        calculateTimeline(us);
    });
}

function calculateTimeline(us) {
    let tasks = us.tasks;
    if (!tasks || tasks.length === 0) return;

    const isValidDate = (d) => d instanceof Date && !isNaN(d);

    let devTasks = tasks.filter(t => t.Activity !== 'Testing');
    let testingTasks = tasks.filter(t => t.Activity === 'Testing');

    // 1. ترتيب مهام التطوير
    devTasks.sort((a, b) => {
        let dateA = new Date(a['Activated Date'] || 0);
        let dateB = new Date(b['Activated Date'] || 0);
        return dateA - dateB;
    });

    let lastDevExpectedEnd;
    let lastDevActualEnd = null;

    devTasks.forEach((t, index) => {
        let hours = parseFloat(t['Original Estimation']) || 0;
        
        // التعديل هنا: استخدام Resolved Date إذا كان Actual End غير موجود
        // 
        let finishDateStr = t['Actual End'] || t['Resolved Date']; 
        if (finishDateStr) {
            let actualEnd = new Date(finishDateStr);
            if (isValidDate(actualEnd)) {
                if (!lastDevActualEnd || actualEnd > lastDevActualEnd) {
                    lastDevActualEnd = actualEnd;
                }
            }
        }

        if (index === 0) {
            let taskAct = t['Activated Date'] ? new Date(t['Activated Date']) : new Date(us.activatedDate);
            t.expectedStart = isValidDate(taskAct) ? taskAct : new Date();
        } else {
            t.expectedStart = new Date(lastDevExpectedEnd);
        }

        t.expectedEnd = addWorkHours(t.expectedStart, hours);
        lastDevExpectedEnd = new Date(t.expectedEnd);
    });

    // 2. ترتيب مهام الاختبار
    testingTasks.sort((a, b) => parseInt(a.id || 0) - parseInt(b.id || 0));

    let lastTestExpectedEnd = null;

    testingTasks.forEach((t, index) => {
        let hours = parseFloat(t['Original Estimation']) || 0;
        
        if (index === 0) {
            let taskAct = t['Activated Date'] ? new Date(t['Activated Date']) : new Date(us.activatedDate);
            t.expectedStart = isValidDate(taskAct) ? taskAct : new Date();
        } 
        else if (index === 1) {
            // الآن سيجد قيمة في lastDevActualEnd لأننا سحبناها من Resolved Date في ملف الـ CSV
            // [cite: 1, 6]
            if (lastDevActualEnd && isValidDate(lastDevActualEnd)) {
                t.expectedStart = new Date(lastDevActualEnd);
            } else {
                t.expectedStart = new Date(lastTestExpectedEnd);
            }
        } 
        else {
            t.expectedStart = new Date(lastTestExpectedEnd);
        }

        t.expectedEnd = addWorkHours(t.expectedStart, hours);
        lastTestExpectedEnd = new Date(t.expectedEnd);
    });

    // تحديث نهاية الـ User Story
    let allTasks = [...devTasks, ...testingTasks];
    if (allTasks.length > 0) {
        let endDates = allTasks.map(t => t.expectedEnd).filter(isValidDate);
        if (endDates.length > 0) {
            us.expectedEnd = new Date(Math.max(...endDates));
        }
    }
}
function addWorkHours(startDate, hours) {
    let date = new Date(startDate);
    let remainingMinutes = hours * 60; // تحويل الساعات إلى دقائق

    while (remainingMinutes > 0) {
        // التحقق من أيام العطلات (الجمعة والسبت)
        if (date.getDay() === 5 || date.getDay() === 6 || holidays.includes(date.toISOString().split('T')[0])) {
            date.setDate(date.getDate() + 1);
            date.setHours(9, 0, 0, 0);
            continue;
        }

        // حساب الدقائق المتبقية حتى نهاية يوم العمل (حتى الساعة 5 مساءً)
        let currentHour = date.getHours();
        let currentMinutes = date.getMinutes();
        let minutesUntilEndOfDay = ((17 - currentHour) * 60) - currentMinutes;

        // إضافة الدقائق المتاحة في اليوم الحالي
        let addedNow = Math.min(remainingMinutes, minutesUntilEndOfDay);
        
        // استخدام getTime وsetTime لإضافة الوقت بدقة بالدقائق
        date.setTime(date.getTime() + (addedNow * 60 * 1000));
        remainingMinutes -= addedNow;

        // إذا انتهى يوم العمل وما زال هناك دقائق متبقية، انتقل لليوم التالي
        if (remainingMinutes > 0 || date.getHours() >= 17) {
            date.setDate(date.getDate() + 1);
            date.setHours(9, 0, 0, 0);
        }
    }
    return date;
}
function calculateHourDiff(start, actual) {
    if (!start || !actual || isNaN(new Date(start)) || isNaN(new Date(actual))) return 0;
    
    let startDate = new Date(start);
    let actualDate = new Date(actual);
    
    // إذا بدأ قبل الموعد، نعتبر التأخير 0
    if (actualDate <= startDate) return 0;

    let totalDiffMinutes = 0;
    let current = new Date(startDate);

    while (current < actualDate) {
        let dayEnd = new Date(current);
        dayEnd.setHours(17, 0, 0, 0); // نهاية العمل 5 مساءً

        if (current.getDay() !== 5 && current.getDay() !== 6 && !holidays.includes(current.toISOString().split('T')[0])) {
            let endOfPeriod = actualDate < dayEnd ? actualDate : dayEnd;
            let diff = (endOfPeriod - current) / (1000 * 60);
            if (diff > 0) totalDiffMinutes += diff;
        }

        // الانتقال لليوم التالي الساعة 9 صباحاً
        current.setDate(current.getDate() + 1);
        current.setHours(9, 0, 0, 0);
    }

    return (totalDiffMinutes / 60).toFixed(1);
}

function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
    const target = document.getElementById(viewId);
    if (target) target.style.display = 'block';
    
    if (processedStories.length === 0) return;

    if (viewId === 'iteration-view') renderIterationView();
    if (viewId === 'business-view') renderBusinessView();
    if (viewId === 'team-view') renderTeamView();
    if (viewId === 'people-view') renderPeopleView();
    if (viewId === 'not-tested-view') renderNotTestedView();
    if (viewId === 'users-view') renderUsersTable();
}

function renderBusinessView() {
    const container = document.getElementById('business-view');
    const grouped = groupBy(processedStories, 'businessArea');
    let html = '<h2>Business Area & User Story Analysis</h2>';
    
    for (let area in grouped) {
        html += `<div class="business-section"><h3 class="business-area-title">${area}</h3>`;
        
        grouped[area].forEach(us => {
            const formatDate = (date) => {
                if (!date || isNaN(new Date(date))) return 'N/A';
                return new Date(date).toLocaleString('en-GB', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'});
            };

            const devTasksSorted = us.tasks
                .filter(t => t.Activity !== 'Testing')
                .sort((a, b) => new Date(a['Activated Date'] || 0) - new Date(b['Activated Date'] || 0));

            const testingTasksSorted = us.tasks
                .filter(t => t.Activity === 'Testing')
                .sort((a, b) => parseInt(a.id || 0) - parseInt(b.id || 0));

            const sortedTasks = [...devTasksSorted, ...testingTasksSorted];

            // دالة مساعدة لعرض السيفيرتي كعدد ونسبة
            const renderSev = (sevObj, total) => {
                if (!total) return 'N/A';
                return `C: ${sevObj.critical} (${((sevObj.critical/total)*100).toFixed(0)}%) | 
                        H: ${sevObj.high} (${((sevObj.high/total)*100).toFixed(0)}%) | 
                        M: ${sevObj.medium} (${((sevObj.medium/total)*100).toFixed(0)}%) |
                        L: ${sevObj.low} (${((sevObj.low/total)*100).toFixed(0)}%)`;
            };

         html += `
<div class="card" style="margin-bottom: 30px; border-left: 5px solid #2980b9; overflow-x: auto;">
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px;">
        <h4>ID: ${us.id} - ${us.title}</h4>
        <div style="text-align: right; font-size: 0.85em; color: #2c3e50; background: #f8f9fa; padding: 10px; border-radius: 8px; border: 1px solid #ddd; line-height: 1.6;">
            <div><b style="color: #27ae60;">US Start:</b> ${formatDate(sortedTasks[0]?.expectedStart)}</div>
            <div><b style="color: #3498db;">US Actual End:</b> ${formatDate(us.testedDate)}</div>
            <div style="margin-top:5px; padding-top:5px; border-top:1px solid #eee;">
                <b style="color: #e67e22;">Cycle Time: ${us.cycleTime || 0} Working Days</b>
            </div>
        </div>
    </div>
                    <p>
                        <b>Dev Lead:</b> ${us.devLead} | 
                        <b>Tester Lead:</b> ${us.testerLead} | 
                        <b style="color: #8e44ad;">DB Mod:</b> ${us.dbEffort.names}
                    </p>
<table>
    <thead>
        <tr>
            <th>Type</th>
            <th>Est. (H)</th>
            <th>Actual (H)</th>
            <th>Bugs / Reviews</th> 
            <th>Bugs Work (H)</th>
            <th>Review Work (H)</th> 
            <th>Effort Variance</th>
        </tr>
    </thead>
    <tbody>
        <tr>
    <td>Dev (Excl. DB)</td>
    <td>${us.devEffort.orig.toFixed(1)}</td>
    <td>${us.devEffort.actual.toFixed(1)}</td>
    
    <td rowspan="3" style="text-align:left; vertical-align:middle; background:#fcfcfc; border: 1px solid #eee; padding: 10px;">
        <div style="margin-bottom: 8px;">
            <b style="color:#c0392b; font-size:0.9em;">🐞 Specific Bugs: ${us.rework.specific.count}</b>
            <div style="font-size: 0.7em; color: #666;">${renderSev(us.rework.specific.severity, us.rework.specific.count)}</div>
        </div>
        <div style="margin-bottom: 8px; padding-top: 5px; border-top: 1px solid #eee;">
            <b style="color:#e67e22; font-size:0.9em;">⚙️ Generic Bugs: ${us.rework.generic.count}</b>
            <div style="font-size: 0.7em; color: #666;">${renderSev(us.rework.generic.severity, us.rework.generic.count)}</div>
        </div>
        <div style="padding-top: 5px; border-top: 1px solid #eee;">
            <b style="color:#8e44ad; font-size:0.9em;">🔎 Reviews: ${us.reviewStats.count}</b>
            <div style="font-size: 0.7em; color: #666;">${renderSev(us.reviewStats.severity, us.reviewStats.count)}</div>
        </div>
    </td>

    <td rowspan="3" style="text-align:center; vertical-align:middle; background:#fff5f5;">
        <div title="Specific Bug Hours" style="color:#c0392b; font-size:0.85em;">Spec: <b>${us.rework.specific.actualTime.toFixed(1)}h</b></div>
        <div title="Generic Bug Hours" style="color:#e67e22; font-size:0.85em; margin-top:5px; border-top: 1px dashed #ffcdd2;">Gen: <b>${us.rework.generic.actualTime.toFixed(1)}h</b></div>
        <div style="margin-top:5px; font-weight:bold; border-top: 1px solid #ffcdd2;">Total: ${(us.rework.actualTime).toFixed(1)}h</div>
    </td>

    <td rowspan="3" style="text-align:center; vertical-align:middle; background:#f5f3ff;">
        <div style="color:#6d28d9; font-size:0.85em;">Dev: <b>${us.reviewStats.devActual.toFixed(1)}h</b></div>
        <div style="color:#2980b9; font-size:0.85em; margin-top:5px;">Test: <b>${us.reviewStats.testActual.toFixed(1)}h</b></div>
    </td>
    
    <td class="${us.devEffort.dev < 0.85 ? 'alert-red' : ''}"><b>${us.devEffort.dev.toFixed(2)}</b></td>
</tr>
        <tr style="background: #f4ecf7;">
            <td>DB Modification</td>
            <td>${us.dbEffort.orig.toFixed(1)}</td>
            <td>${us.dbEffort.actual.toFixed(1)}</td>
            <td class="${us.dbEffort.dev < 0.85 ? 'alert-red' : ''}"><b>${us.dbEffort.dev.toFixed(2)}</b></td>
        </tr>
        <tr>
            <td>Test</td>
            <td>${us.testEffort.orig.toFixed(1)}</td>
            <td>${us.testEffort.actual.toFixed(1)}</td>
            <td class="${us.testEffort.dev < 0.85 ? 'alert-red' : ''}"><b>${us.testEffort.dev.toFixed(2)}</b></td>
        </tr>
    </tbody>
</table>

                    <h5 style="margin: 20px 0 10px 0; color: #2c3e50;">Tasks Timeline & Schedule:</h5>
                    <table style="font-size: 0.85em; width: 100%;">
                        <thead>
                            <tr style="background:#eee;">
                                <th>ID</th>
                                <th>Task Name</th>
                                <th>Activity</th>
                                <th>Est</th>
                                <th>Exp. Start</th>
                                <th>Exp. End</th>
                                <th>Act. Start</th>
                                <th>Act. End</th> 
                                <th>TS Total</th>
                                <th>Delay</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${sortedTasks.map(t => {
                                const tsTotal = (parseFloat(t['TimeSheet_DevActualTime']) || 0) + (parseFloat(t['TimeSheet_TestingActualTime']) || 0);
                                const est = parseFloat(t['Original Estimation']) || 0;
                                const actualEnd = t['Actual End'] || t['Resolved Date'];
                                return `
                                <tr>
                                    <td>${t['ID']}</td>
                                    <td style="max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${t['Title']}">${t['Title'] || 'N/A'}</td>
                                    <td>${t['Activity']}</td>
                                    <td>${est}</td>
                                    <td style="background-color: #e8f4fd; font-weight: 500;">${formatDate(t.expectedStart)}</td>
                                    <td>${formatDate(t.expectedEnd)}</td>
                                    <td style="background-color: #eafaf1; font-weight: 500;">${formatDate(t['Activated Date'])}</td>
                                    <td>${formatDate(actualEnd)}</td> 
                                    <td>${tsTotal}</td>
                                    <td class="${calculateHourDiff(t.expectedStart, t['Activated Date']) > 0 ? 'alert-red' : ''}">
                                        ${calculateHourDiff(t.expectedStart, t['Activated Date'])}h
                                    </td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>`;

            html += `
                <div style="background: #fdfdfd; padding: 15px; border-radius: 8px; margin-top: 15px; border: 1px solid #eee; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <h5 style="margin: 0; color: #2c3e50;">Quality & Review Analysis</h5>
                        <div style="display: flex; gap: 10px;">
                            <span style="background: #f5f3ff; color: #5b21b6; padding: 4px 10px; border-radius: 20px; font-size: 0.8em; font-weight: bold; border: 1px solid #ddd;">
                                🔎 Review Actual: Dev ${us.reviewStats.devActual.toFixed(1)}h | Test ${us.reviewStats.testActual.toFixed(1)}h
                            </span>
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 20px; align-items: center;">
                        <div style="flex: 1;">
                            <div style="display: flex; justify-content: space-between; font-size: 0.85em; margin-bottom: 5px;">
                                <span>Quality Ratio: <b>${(( (us.rework.actualTime + us.reviewStats.totalActual) / (us.devEffort.actual || 1)) * 100).toFixed(1)}%</b></span>
                            </div>
                            <div style="width: 100%; background: #eee; height: 10px; border-radius: 5px; overflow: hidden; display: flex;">
                                <div style="width: ${Math.min((us.rework.actualTime / (us.devEffort.actual || 1) * 100), 100)}%; background: #e74c3c;" title="Standard Bugs"></div>
                                <div style="width: ${Math.min((us.reviewStats.devActual / (us.devEffort.actual || 1) * 100), 100)}%; background: #8e44ad;" title="Dev Review"></div>
                                <div style="width: ${Math.min((us.reviewStats.testActual / (us.devEffort.actual || 1) * 100), 100)}%; background: #3498db;" title="Test Review"></div>
                            </div>
                        </div>
                    </div>
                </div></div>`; 
        });
        html += `</div>`;
    }
    container.innerHTML = html;
}

function renderTeamView() {
    const container = document.getElementById('team-view');
    if (!processedStories || processedStories.length === 0) {
        container.innerHTML = "<div class='card'><h2>Team Performance</h2><p>No data available.</p></div>";
        return;
    }
    const grouped = groupBy(processedStories, 'businessArea');

    let devParticipation = {};
    let testerParticipation = {};
    let dbParticipation = {};
    let areaDevs = {};
    let areaTesters = {};
    let areaDbs = {};

    for (let area in grouped) {
        areaDevs[area] = new Set();
        areaTesters[area] = new Set();
        areaDbs[area] = new Set();
        grouped[area].forEach(us => {
            if (us.devLead) areaDevs[area].add(us.devLead);
            if (us.testerLead) areaTesters[area].add(us.testerLead);
            if (us.tasks) {
                us.tasks.forEach(t => {
                    if (t['Activity'] === 'DB Modification' && t['Assigned To']) {
                        areaDbs[area].add(t['Assigned To']);
                    }
                });
            }
        });
        areaDevs[area].forEach(d => {
            devParticipation[d] = (devParticipation[d] || 0) + 1;
        });
        areaTesters[area].forEach(t => {
            testerParticipation[t] = (testerParticipation[t] || 0) + 1;
        });
        areaDbs[area].forEach(db => {
            dbParticipation[db] = (dbParticipation[db] || 0) + 1;
        });
    }

    let html = `
    <div style="direction: ltr; text-align: left; font-family: 'Segoe UI', Tahoma, sans-serif; padding: 20px;">
        <h2 style="margin-bottom:30px; color: #2c3e50; border-left: 6px solid #2ecc71; padding-left: 20px; font-size: 1.8em;"> 
            🚀 Team Performance Analytics (Unified QC & Review Scope) 
        </h2>`;

    for (let area in grouped) {
        let stats = {
            totalEst: 0,
            totalAct: 0,
            reworkTime: 0,
            reviewTime: 0,
            bugsCount: 0,
            bugsCrit: 0,
            bugsHigh: 0,
            bugsMed: 0,
            bugsLow: 0,
            reviewCount: 0,
            revCrit: 0,
            revHigh: 0,
            revMed: 0,
            revLow: 0,
            totalStories: grouped[area].length,
            closedStoriesCount: 0,
            totalCycleTime: 0,
            totalUatBugs: 0,
            totalIterationBugs: 0
        };

        let devCountCount = 0;
        areaDevs[area].forEach(d => {
            if(devParticipation[d]) devCountCount += (1 / devParticipation[d]);
        });
        let testerCountCount = 0;
        areaTesters[area].forEach(t => {
            if(testerParticipation[t]) testerCountCount += (1 / testerParticipation[t]);
        });
        let dbCountCount = 0;
        areaDbs[area].forEach(db => {
            if(dbParticipation[db]) dbCountCount += (1 / dbParticipation[db]);
        });

        grouped[area].forEach(us => {
            const sEst = us.devEffort.orig + us.testEffort.orig + (us.dbEffort?.orig || 0);
            const sRvTime = us.reviewStats.devActual + us.reviewStats.testActual;
            const sAct = us.devEffort.actual + us.testEffort.actual + (us.dbEffort?.actual || 0) + us.rework.actualTime + sRvTime;
            
            stats.totalEst += sEst;
            stats.totalAct += sAct;
            stats.reworkTime += us.rework.actualTime;
            stats.reviewTime += sRvTime;
            stats.totalCycleTime += (us.cycleTime || 0);
            stats.bugsCount += us.rework.count;
            stats.bugsCrit += us.rework.severity.critical;
            stats.bugsHigh += us.rework.severity.high;
            stats.bugsMed += us.rework.severity.medium;
            stats.bugsLow += us.rework.severity.low;
            stats.reviewCount += us.reviewStats.count;
            stats.revCrit += us.reviewStats.severity.critical;
            stats.revHigh += us.reviewStats.severity.high;
            stats.revMed += us.reviewStats.severity.medium;
            stats.revLow += us.reviewStats.severity.low;

            stats.totalUatBugs += (us.rework.uatBugsCount || 0);
            stats.totalIterationBugs += (us.rework.iterationBugsCount || 0);

            if (us.status === 'Closed' || us.status === 'Tested' || us.status === 'Resolved' || us.status === 'To Be Reviewed') {
                stats.closedStoriesCount++;
            }
        });

        const effortVariance = stats.totalEst > 0 ? ((stats.totalAct - stats.totalEst) / stats.totalEst) * 100 : 0;
        const combinedReworkRatio = ((stats.reworkTime + stats.reviewTime) / (stats.totalAct || 1)) * 100;
        const avgCycleTime = (stats.totalCycleTime / stats.totalStories).toFixed(1);

        const dreValueNum = stats.totalIterationBugs > 0 ? ((stats.totalUatBugs / stats.totalIterationBugs) * 100) : 0;
        const dreValue = dreValueNum.toFixed(1);
        
        const dreColor = dreValueNum <= 15 ? '#2e7d32' : '#d32f2f';
        const varianceColor = effortVariance <= 15 ? '#2e7d32' : '#d32f2f';
        const reworkColor = combinedReworkRatio > 15 ? '#d32f2f' : '#2e7d32';

        const getSevBadges = (c, h, m, l, t) => {
            if (!t) return '<div style="color:#7f8c8d; margin-top:5px; font-size:0.85em; font-style:italic;">No records found</div>';
            const pct = (v) => ((v / t) * 100).toFixed(0);
            const badgeStyle = (bg, color, border) => `background:${bg}; color:${color}; padding:8px 4px; border-radius:6px; text-align:center; flex:1; border:1px solid ${border}; display: flex; flex-direction: column; justify-content: center; min-width:65px;`;
            return `
             <div style="display: flex; gap: 6px; margin-top: 10px;">
                <div style="${badgeStyle('#ffeaed', '#c0392b', '#ffcdd2')}"><span style="font-size:10px; font-weight:600;">Critical</span><b style="font-size:14px; margin-top:2px;">${c}</b><span style="font-size:9px; opacity:0.8;">${pct(c)}%</span></div>
                <div style="${badgeStyle('#fff3e0', '#e67e22', '#ffe0b2')}"><span style="font-size:10px; font-weight:600;">High</span><b style="font-size:14px; margin-top:2px;">${h}</b><span style="font-size:9px; opacity:0.8;">${pct(h)}%</span></div>
                <div style="${badgeStyle('#e8f4fd', '#2980b9', '#bbdefb')}"><span style="font-size:10px; font-weight:600;">Medium</span><b style="font-size:14px; margin-top:2px;">${m}</b><span style="font-size:9px; opacity:0.8;">${pct(m)}%</span></div>
                <div style="${badgeStyle('#f5f5f5', '#7f8c8d', '#e0e0e0')}"><span style="font-size:10px; font-weight:600;">Low</span><b style="font-size:14px; margin-top:2px;">${l}</b><span style="font-size:9px; opacity:0.8;">${pct(l)}%</span></div>
             </div>`;
        };

        function generateAdvancedQualityAnalysis(s) {
            let insights = [];
            
            const totalIssues = s.bugsCount + s.reviewCount;
            const reviewCatchRate = totalIssues > 0 ? (s.reviewCount / totalIssues) * 100 : 0;
            const highSevBugs = s.bugsCrit + s.bugsHigh;
            const highSevReviews = s.revCrit + s.revHigh;
            const avgTimePerBug = s.bugsCount > 0 ? (s.reworkTime / s.bugsCount) : 0;
            
            const effortVariance = s.totalEst > 0 ? ((s.totalAct - s.totalEst) / s.totalEst) * 100 : 0;
            const combinedReworkRatio = ((s.reworkTime + s.reviewTime) / (s.totalAct || 1)) * 100;
            const avgCycleTime = s.totalStories > 0 ? (s.totalCycleTime / s.totalStories) : 0;
            
            const totalIterationBugs = s.totalIterationBugs || (s.bugsCount + (s.totalUatBugs || 0));
            const dreValueNum = totalIterationBugs > 0 ? ((s.bugsCount / totalIterationBugs) * 100) : 100;

            const bugSeverityRatio = s.bugsCount > 0 ? (highSevBugs / s.bugsCount) * 100 : 0;
            const reviewSeverityRatio = s.reviewCount > 0 ? (highSevReviews / s.reviewCount) * 100 : 0;
            const uatLeakageRatio = totalIterationBugs > 0 ? ((s.totalUatBugs || 0) / totalIterationBugs) * 100 : 0;

            if (reviewCatchRate > 40) {
                insights.push(`<li><b>Shift-Left Strategy Efficiency:</b> Peer Reviews intercepted <span style="color:#27ae60; font-weight:bold;">${reviewCatchRate.toFixed(1)}%</span> of total issues before reaching the formal testing execution cycle. This indicates a proactive engineering culture with strong desk-checks.</li>`);
            } else if (reviewCatchRate > 15) {
                insights.push(`<li><b>Shift-Left Progression:</b> Peer Reviews managed to catch <span style="color:#3498db; font-weight:bold;">${reviewCatchRate.toFixed(1)}%</span> of product defects. There is room to further strengthen code reviews to optimize the quality pipeline.</li>`);
            } else {
                insights.push(`<li><b>Shift-Left Risk Warning:</b> Peer Reviews intercepted only <span style="color:#e74c3c; font-weight:bold;">${reviewCatchRate.toFixed(1)}%</span> of total anomalies. The majority of issues were pushed directly into formal testing, increasing downstream pressure on Testing. Immediately reinforce code-review policies.</li>`);
            }

            if (effortVariance > 15 && combinedReworkRatio > 15) {
                insights.push(`<li><b>⚠️ Rework-Driven Slippage:</b> Both Effort Variance (<span style="color:#e74c3c; font-weight:bold;">${effortVariance.toFixed(1)}%</span>) and Rework Ratio (<span style="color:#e74c3c; font-weight:bold;">${combinedReworkRatio.toFixed(1)}%</span>) have breached control limits. This statistical correlation proves that iteration slippage is driven by heavy code stabilization and bug-fixing overhead rather than scoping changes.</li>`);
            } else if (effortVariance > 15 && combinedReworkRatio <= 15) {
                insights.push(`<li><b>🔍 Estimation Model Baseline Flaw:</b> Effort Variance is high (<span style="color:#e67e22; font-weight:bold;">${effortVariance.toFixed(1)}%</span>) but Rework/Review metrics remain healthy (<span style="color:#27ae60; font-weight:bold;">${combinedReworkRatio.toFixed(1)}%</span>). This diagnostic signals that the baseline estimation models or story grooming breakdowns are flawed, as pure engineering hours exceeded estimates without quality friction.</li>`);
            } else if (effortVariance <= 0 && combinedReworkRatio > 20) {
                insights.push(`<li><b>⚡ Aggressive Coding & Velocity Risk:</b> The area delivered within/under the estimated budget (Variance: <span style="color:#27ae60; font-weight:bold;">${effortVariance.toFixed(1)}%</span>), yet rework density is critical (<span style="color:#e74c3c; font-weight:bold;">${combinedReworkRatio.toFixed(1)}%</span>). This pattern alerts to "aggressive rushing" to meet deadlines, causing technical debt that will likely trigger regressions.</li>`);
            }

            if (dreValueNum < 80 && (s.totalUatBugs || 0) > 0) {
                insights.push(`<li><b>🛑 Degraded Quality Shield (Low DRE):</b> Defect Removal Efficiency dropped to <span style="color:#e74c3c; font-weight:bold;">${dreValueNum.toFixed(1)}%</span> due to <span style="color:#e74c3c; font-weight:bold;">${s.totalUatBugs} UAT Leakages</span>. The internal verification tracks (Testing & Reviews) are bypassing critical end-user business scenarios; staging integration tests require alignment with production workflows.</li>`);
            } else if (dreValueNum >= 95 && s.bugsCount > 0) {
                insights.push(`<li><b>🎯 Elite Verification Integrity:</b> Outstanding DRE at <span style="color:#27ae60; font-weight:bold;">${dreValueNum.toFixed(1)}%</span>. The combination of peer checks and internal testing execution acted as a near-perfect barrier, containing defects internally and protecting the customer environment.</li>`);
            }

            if (s.bugsCount > 0) {
                if (bugSeverityRatio > 30) {
                    insights.push(`<li><b>Defect Severity Alert:</b> Highly severe defects (Critical/High) constitute <span style="color:#e74c3c; font-weight:bold;">${bugSeverityRatio.toFixed(1)}%</span> of the formal test cycle bugs. Focus on architectural stability and technical requirements alignment during development.</li>`);
                    if (highSevReviews === 0) {
                        insights.push(`<li><b>🔎 Review Blind Spot Diagnosis:</b> While testing detected <span style="color:#e74c3c; font-weight:bold;">${highSevBugs} High/Critical bugs</span>, Peer Reviews intercepted <span style="color:#747d8c; font-weight:bold;">0</span>. Peer audits are entirely blind to core architecture, integration constraints, or deep database schemas, acting only as superficial code format checks.</li>`);
                    }
                } else {
                    insights.push(`<li><b>Defect Profile Stability:</b> High-severity leaks during execution are low (<span style="color:#27ae60; font-weight:bold;">${bugSeverityRatio.toFixed(1)}%</span>), meaning most detected bugs are minor/functional tweaks.</li>`);
                }
            }

            if (avgTimePerBug > 4 && s.bugsCount > 0) {
                insights.push(`<li><b>Rework Friction:</b> Mean Time to Resolve (MTTR) a formal bug is high (<span style="color:#e67e22; font-weight:bold;">${avgTimePerBug.toFixed(1)}h/bug</span>). This signals deep structural dependencies or tracking overhead in logging timesheets.</li>`);
                if (avgCycleTime > 5) {
                    insights.push(`<li><b>⏳ Blocked Cycle Time Correlation:</b> The prolonged user story cycle time (<span style="color:#8e44ad; font-weight:bold;">${avgCycleTime.toFixed(1)} days</span>) is statistically linked to the resolution complexity of bugs (${avgTimePerBug.toFixed(1)}h). User stories are stalling in the "Testing/Rework" phase for multiple days due to resolution drag.</li>`);
                }
            }

            if (reviewSeverityRatio > 40 && bugSeverityRatio < 15 && s.reviewCount > 0) {
                insights.push(`<li><b>🛡️ High-Fidelity Pre-Emptive Review:</b> Peer reviews are filtering architectural flaws early (High-Sev Review: <span style="color:#27ae60; font-weight:bold;">${reviewSeverityRatio.toFixed(1)}%</span>) resulting in a highly clean and stable build deployed to testing (High-Sev Testing Bugs: <span style="color:#27ae60; font-weight:bold;">${bugSeverityRatio.toFixed(1)}%</span>). This validates high engineering discipline.</li>`);
            }

            if (s.reviewCount > 10 && highSevReviews === 0 && bugSeverityRatio > 40) {
                insights.push(`<li><b>🚨 Superficial Peer-Review Pattern:</b> High volume of Peer Reviews (<span style="color:#8e44ad; font-weight:bold;">${s.reviewCount}</span>) detected zero high-severity issues, yet testing faced critical/high bottlenecks (<span style="color:#e74c3c; font-weight:bold;">${bugSeverityRatio.toFixed(1)}%</span>). Code sign-offs are purely process-driven/administrative without technical validation depth.</li>`);
            }

            if (effortVariance > 25 && combinedReworkRatio < 5 && s.bugsCount > 0) {
                insights.push(`<li><b>🕵️ Hidden Rework & Timesheet Inaccuracy:</b> Significant effort variance found (<span style="color:#e74c3c; font-weight:bold;">${effortVariance.toFixed(1)}%</span>) with artificially low logged rework/review time (<span style="color:#e67e22; font-weight:bold;">${combinedReworkRatio.toFixed(1)}%</span>). Team members are likely fixing bugs and refactoring code implicitly under normal development hours without proper activity logging.</li>`);
            }

            if (s.bugsCount > 0 && s.bugsCount <= 3 && avgTimePerBug > 8) {
                insights.push(`<li><b>🏗️ Severe Architectural Coupling:</b> Low defect density (Only <span style="color:#3498db; font-weight:bold;">${s.bugsCount} bugs</span>) but extreme MTTR (<span style="color:#e74c3c; font-weight:bold;">${avgTimePerBug.toFixed(1)} hours/bug</span>). The system suffers from high coupling or fragile dependencies; changing minor code paths requires massive code tracing and extensive debugging effort.</li>`);
            }

            if (uatLeakageRatio > 25 && s.bugsCount > 0) {
                insights.push(`<li><b>💥 Severe Quality Gate Escape:</b> Out of total Defects, UAT Leakages reached <span style="color:#e74c3c; font-weight:bold;">${uatLeakageRatio.toFixed(1)}%</span>. Internal quality gates are misaligned with business integration logic or the staging environment lacks proper test-data combinations found in user-acceptance tracks.</li>`);
            }

            if (s.dbCountCount > 0 && avgCycleTime > 6 && bugSeverityRatio > 35) {
                insights.push(`<li><b>🗄️ Database Coupling Friction:</b> Data tier modifications (FTE: <span style="color:#8e44ad; font-weight:bold;">${s.dbCountCount.toFixed(2)}</span>) are heavily correlating with an extended cycle time (<span style="color:#e67e22; font-weight:bold;">${avgCycleTime.toFixed(1)} days</span>) and high bug severity. Changes in tables/schemas are causing breaking impacts across application blocks. Require stricter DB design reviews.</li>`);
            }

            if (s.devCountCount > 0 && s.testerCountCount > 0) {
                const devToTesterRatio = s.devCountCount / s.testerCountCount;
                if (devToTesterRatio > 3 && s.totalUatBugs > 2) {
                    insights.push(`<li><b>⚖️ Resource Skew & Test Bottleneck:</b> Asymmetric Dev-to-Tester Capacity ratio (<span style="color:#e67e22; font-weight:bold;">${devToTesterRatio.toFixed(1)}:1</span>) matched with UAT leakages. Testing capacity is diluted under a flood of incoming dev code updates, leading to shallow operational verification passes.</li>`);
                }
            }

            if (effortVariance >= -5 && effortVariance <= 10 && combinedReworkRatio <= 12 && dreValueNum >= 90) {
                insights.push(`<li><b>🌟 Quantitative Process Control (CMMI Level 4 Class):</b> This area exhibits exceptional statistical predictability. Effort variance (<span style="color:#27ae60; font-weight:bold;">${effortVariance.toFixed(1)}%</span>) and rework overhead are perfectly bounded, proving mature refinement, precise sizing, and excellent implementation execution.</li>`);
            }

            if (insights.length === 0) {
                return "<li><b>✅ Balanced Quality Lifecycle:</b> No critical dynamic anomalies observed for this iteration. All performance, effort variances, and quality gating structures reside safely within engineering control thresholds.</li>";
            }
            
            return insights.join('');
        }

        html += `
        <div class="card" style="background:#ffffff; border-radius:12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); padding:25px; margin-bottom:35px; border-top: 4px solid #2ccc71;">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #f1f2f6; padding-bottom:15px; margin-bottom:20px;">
                <h3 style="margin:0; color:#2c3e50; font-size:1.4em; font-weight:700;">📂 Business Area: ${area}</h3>
                <span style="background:#f1f2f6; color:#2c3e50; padding:6px 14px; border-radius:20px; font-size:0.85em; font-weight:600;">
                    📊 Stories: <b>${stats.closedStoriesCount} / ${stats.totalStories} Closed</b>
                </span>
            </div>

            <div style="display:flex; gap:15px; margin-bottom:25px; background:#f8f9fa; padding:12px; border-radius:8px; font-size:0.9em; color:#57606f; border:1px solid #edeec4;">
                <span>👥 <b>FTE Dev Capacity:</b> ${devCountCount.toFixed(2)}</span> | 
                <span>🧪 <b>FTE Tester Capacity:</b> ${testerCountCount.toFixed(2)}</span> | 
                <span>🗄️ <b>FTE DB Capacity:</b> ${dbCountCount.toFixed(2)}</span>
            </div>

            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:20px; margin-bottom:30px;">
                
                <div style="background:#fafafa; border-radius:10px; padding:20px; border-left:4px solid ${varianceColor}; box-shadow:0 2px 5px rgba(0,0,0,0.02);">
                    <div style="font-size:0.85em; color:#747d8c; text-transform:uppercase; font-weight:600;">Effort Variance</div>
                    <div style="font-size:1.8em; font-weight:700; color:${varianceColor}; margin:5px 0;">${effortVariance.toFixed(1)}%</div>
                    <div style="font-size:0.8em; color:#57606f;">Est: <b>${stats.totalEst.toFixed(1)}h</b> | Act: <b>${stats.totalAct.toFixed(1)}h</b></div>
                </div>

                <div style="background:#fafafa; border-radius:10px; padding:20px; border-left:4px solid ${reworkColor}; box-shadow:0 2px 5px rgba(0,0,0,0.02);">
                    <div style="font-size:0.85em; color:#747d8c; text-transform:uppercase; font-weight:600;">Rework & Review Ratio</div>
                    <div style="font-size:1.8em; font-weight:700; color:${reworkColor}; margin:5px 0;">${combinedReworkRatio.toFixed(1)}%</div>
                    <div style="font-size:0.8em; color:#57606f;">Bugs: <b>${stats.reworkTime.toFixed(1)}h</b> | Revs: <b>${stats.reviewTime.toFixed(1)}h</b></div>
                </div>

                <div style="background:#fafafa; border-radius:10px; padding:20px; border-left:4px solid ${dreColor}; box-shadow:0 2px 5px rgba(0,0,0,0.02);">
                    <div style="font-size:0.85em; color:#747d8c; text-transform:uppercase; font-weight:600;">DRE</div>
                    <div style="font-size:1.8em; font-weight:700; color:${dreColor}; margin:5px 0;">${dreValue}%</div>
                    <div style="font-size:0.8em; color:#57606f;">UAT: <b>${stats.totalUatBugs}</b> / Iteration: <b>${stats.totalIterationBugs}</b></div>
                </div>

                <div style="background:#fafafa; border-radius:10px; padding:20px; border-left:4px solid #8e44ad; box-shadow:0 2px 5px rgba(0,0,0,0.02);">
                    <div style="font-size:0.85em; color:#747d8c; text-transform:uppercase; font-weight:600;">Avg Cycle Time</div>
                    <div style="font-size:1.8em; font-weight:700; color:#8e44ad; margin:5px 0;">${avgCycleTime} Days</div>
                    <div style="font-size:0.8em; color:#57606f;">Total Net Days: <b>${stats.totalCycleTime}</b></div>
                </div>

            </div>

            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:25px; margin-bottom:20px;">
                <div style="background:#fff; border:1px solid #eaeed8; border-radius:10px; padding:18px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; font-weight:600; color:#2c3e50; border-bottom:1px solid #f1f2f6; padding-bottom:8px;">
                        <span>🐞 Execution Bugs Detail</span>
                        <span style="background:#ffebee; color:#c62828; font-size:0.8em; padding:2px 8px; border-radius:10px;">Count: ${stats.bugsCount}</span>
                    </div>
                    ${getSevBadges(stats.bugsCrit, stats.bugsHigh, stats.bugsMed, stats.bugsLow, stats.bugsCount)}
                </div>

                <div style="background:#fff; border:1px solid #eaeed8; border-radius:10px; padding:18px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; font-weight:600; color:#2c3e50; border-bottom:1px solid #f1f2f6; padding-bottom:8px;">
                        <span>🔎 Shift-Left Reviews Detail</span>
                        <span style="background:#f3e5f5; color:#6a1b9a; font-size:0.8em; padding:2px 8px; border-radius:10px;">Count: ${stats.reviewCount}</span>
                    </div>
                    ${getSevBadges(stats.revCrit, stats.revHigh, stats.revMed, stats.revLow, stats.reviewCount)}
                </div>
            </div>

            <div style="margin-top:25px; background:#f9f9fb; border-radius:8px; padding:20px; border:1px solid #eccc68; box-shadow:inset 0 1px 3px rgba(0,0,0,0.02);">
                <h4 style="margin:0 0 12px 0; color:#ffa502; font-size:1.05em; font-weight:700; display:flex; align-items:center; gap:8px;">
                    🧠 AI & CMMI Engineering Quality Insights
                </h4>
                <ul style="margin:0; padding-left:20px; font-size:0.92em; color:#2c3e50; line-height:1.6;">
                    ${generateAdvancedQualityAnalysis(stats)}
                </ul>
            </div>

        </div>`;
    }

    html += `</div>`;
    container.innerHTML = html;
}
function renderPeopleView() {
    const container = document.getElementById('people-view');
    if (!container) return;

    const businessAreas = {};

    // 1. تجميع البيانات وتصنيف الموظفين
    processedStories.forEach(us => {
        const area = us.businessArea || 'General';
        if (!businessAreas[area]) {
            businessAreas[area] = {};
        }
        const peopleMap = businessAreas[area];
        const isReport = us.title && us.title.toLowerCase().includes("patient reports");

        us.tasks.forEach(t => {
            const person = t['Assigned To'];
            if (!person) return;

            if (!peopleMap[person]) {
                peopleMap[person] = {
                    name: person,
                    devHours: 0,
                    testHours: 0,
                    dbHours: 0,
                    stories: new Set(),
                    reportStories: new Set(),
                    genericBugs: { count: 0, hours: 0 },
                    specificBugs: { count: 0, hours: 0 },
                    reviews: { count: 0, hours: 0 }
                };
            }

            const actDev = parseFloat(t['TimeSheet_DevActualTime']) || 0;
            const actTest = parseFloat(t['TimeSheet_TestingActualTime']) || 0;
            const activity = t['Activity'];

            if (activity === 'Testing') peopleMap[person].testHours += actTest;
            else if (activity === 'DB Modification') peopleMap[person].dbHours += actDev;
            else if (activity === 'Development') peopleMap[person].devHours += actDev;

            peopleMap[person].stories.add(us.id);
            if (isReport) {
                peopleMap[person].reportStories.add(us.id);
            }
        });

        // ربط البجات بالـ Dev Lead
        const devLead = us.devLead;
        if (devLead && peopleMap[devLead]) {
            peopleMap[devLead].genericBugs.count += us.rework.generic.count;
            peopleMap[devLead].genericBugs.hours += us.rework.generic.actualTime;
            peopleMap[devLead].specificBugs.count += us.rework.specific.count;
            peopleMap[devLead].specificBugs.hours += us.rework.specific.actualTime;
        }
    });

    let html = `
        <div style="direction: ltr; text-align: left; font-family: 'Segoe UI', sans-serif;">
            <h2 style="margin-bottom:30px; color: #123b63; border-left: 6px solid #3498db; padding-left: 20px;">👥 Team Performance by Business Area</h2>`;

    for (let area in businessAreas) {
        html += `
            <div class="area-section" style="margin-bottom: 50px; border: 1px solid #ddd; border-radius: 8px; padding: 20px; background: #fcfcfc;">
                <h3 style="background: #2980b9; padding: 12px 20px; border-radius: 5px; color: white; margin-top: 0;">🏢 Business Area: ${area}</h3>`;

        const allPeople = Object.values(businessAreas[area]);

        // تقسيم الموظفين لمجموعات (شخص قد يظهر في أكثر من مجموعة إذا عمل في أنشطة مختلفة)
        const devs = allPeople.filter(p => p.devHours > 0);
        const testers = allPeople.filter(p => p.testHours > 0);
        const dbs = allPeople.filter(p => p.dbHours > 0);

        // دالة مساعدة لإنشاء الجداول لكل دور
        const renderRoleTable = (title, peopleList, color) => {
            if (peopleList.length === 0) return '';
            
            let tableHtml = `
                <div style="margin-top: 25px;">
                    <h4 style="color: ${color}; border-bottom: 2px solid ${color}; display: inline-block; padding-bottom: 5px;">${title}</h4>
                    <div class="table-container" style="overflow-x:auto; margin-top: 10px;">
                        <table style="width:100%; border-collapse: collapse; background: white; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                            <thead>
                                <tr style="background: ${color}; color: Black;">
                                    <th style="padding: 12px; text-align: left;">Name</th>
                                    <th style="padding: 12px; text-align: center;">Stories</th>
                                    <th style="padding: 12px; text-align: center;">Reports</th>
                                    <th style="padding: 12px; text-align: center;">Dev Hours</th>
                                    <th style="padding: 12px; text-align: center;">Test Hours</th>
                                    <th style="padding: 12px; text-align: center;">DB Hours</th>
                                    <th style="padding: 12px; text-align: center;">Spec. Bugs</th>
                                    <th style="padding: 12px; text-align: center;">Gen. Bugs</th>
                                    <th style="padding: 12px; text-align: center;">Total</th>
                                </tr>
                            </thead>
                            <tbody>`;

            peopleList.forEach(p => {
                const totalWork = p.devHours + p.testHours + p.dbHours;
                tableHtml += `
                    <tr style="border-bottom: 1px solid #eee;">
                        <td style="padding: 10px; font-weight: bold; color: #34495e;">${p.name}</td>
                        <td style="padding: 10px; text-align: center;">${p.stories.size}</td>
                        <td style="padding: 10px; text-align: center; font-weight: bold; color: #2980b9; background: #f0f7ff;">${p.reportStories.size}</td>
                        <td style="padding: 10px; text-align: center;">${p.devHours.toFixed(1)}h</td>
                        <td style="padding: 10px; text-align: center;">${p.testHours.toFixed(1)}h</td>
                        <td style="padding: 10px; text-align: center;">${p.dbHours.toFixed(1)}h</td>
                        <td style="padding: 10px; text-align: center; background: #fff5f5;">
                            <span style="color: #c0392b; font-weight:bold;">${p.specificBugs.count}</span>
                            <br><small style="color: #666;">${p.specificBugs.hours.toFixed(1)}h</small>
                        </td>
                        <td style="padding: 10px; text-align: center; background: #fffaf5;">
                            <span style="color: #d35400; font-weight:bold;">${p.genericBugs.count}</span>
                            <br><small style="color: #666;">${p.genericBugs.hours.toFixed(1)}h</small>
                        </td>
                        <td style="padding: 10px; text-align: center; font-weight: bold;">${totalWork.toFixed(1)}h</td>
                    </tr>`;
            });

            tableHtml += `</tbody></table></div></div>`;
            return tableHtml;
        };

        // عرض الجداول الثلاثة داخل الـ Business Area
        html += renderRoleTable('💻 Development Team', devs, '#2c3e50');
        html += renderRoleTable('🧪 Testing Team', testers, '#27ae60');
        html += renderRoleTable('🗄️ Database Team', dbs, '#8e44ad');

        html += `</div>`; // نهاية الـ area-section
    }

    html += `</div>`;
    container.innerHTML = html;
}
function generateModernCards(dataObj, type) {
    const keys = Object.keys(dataObj);
    if (keys.length === 0) return '<p style="text-align:center; padding:20px; color:#999;">No data available</p>';

    return keys.map(name => {
        const p = dataObj[name];
        // حساب الكفاءة: (المخطط / الفعلي الكلي)
        const efficiency = (p.est / (p.act || 1)) * 100;
        const efficiencyColor = efficiency >= 85 ? '#2e7d32' : (efficiency >= 60 ? '#f39c12' : '#d32f2f');

        return `
        <div class="person-card" style="background:white; border:1px solid #eee; border-radius:10px; padding:15px; margin-bottom:15px; box-shadow:0 2px 5px rgba(0,0,0,0.05);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <strong style="font-size:1.1em; color:#333;">${p.name}</strong>
                <span style="font-size:0.8em; background:#eee; padding:2px 8px; border-radius:10px;">Stories: ${p.stories}</span>
            </div>
            
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:12px;">
                <div style="text-align:center; padding:8px; background:#f8f9fa; border-radius:6px;">
                    <div style="font-size:0.7em; color:#666; text-transform:uppercase;">Estimation</div>
                    <div style="font-size:1.2em; font-weight:bold; color:#2c3e50;">${p.est.toFixed(1)}h</div>
                </div>
                <div style="text-align:center; padding:8px; background:#f8f9fa; border-radius:6px;">
                    <div style="font-size:0.7em; color:#666; text-transform:uppercase;">Actual (Total)</div>
                    <div style="font-size:1.2em; font-weight:bold; color:#2c3e50;">${p.act.toFixed(1)}h</div>
                </div>
            </div>

            <div style="margin-bottom:15px;">
                <div style="display:flex; justify-content:space-between; font-size:0.8em; margin-bottom:4px;">
                    <span>Efficiency Index</span>
                    <span style="color:${efficiencyColor}; font-weight:bold;">${efficiency.toFixed(1)}%</span>
                </div>
                <div style="width:100%; height:6px; background:#eee; border-radius:3px;">
                    <div style="width:${Math.min(efficiency, 100)}%; height:100%; background:${efficiencyColor}; border-radius:3px;"></div>
                </div>
            </div>

            ${type === 'dev' ? `
            <div style="display: flex; gap: 8px;">
                <div style="flex: 1; background: #fff5f5; border-radius: 8px; padding: 10px; border-left: 4px solid #c62828;">
                    <div style="font-size: 0.75em; color: #c62828; font-weight: bold;">🪲 BUGS: ${p.bugs}</div>
                    <div style="font-size: 1.1em; font-weight: 900; color: #c62828;">${p.rwTime.toFixed(1)}h</div>
                    <div style="font-size: 0.65em; font-family: monospace; color: #777; margin-top: 4px;">C:${p.crit} H:${p.high} M:${p.med}</div>
                </div>
                <div style="flex: 1; background: #f5f3ff; border-radius: 8px; padding: 10px; border-left: 4px solid #6d28d9;">
                    <div style="font-size: 0.75em; color: #6d28d9; font-weight: bold;">🔎 REVIEW</div>
                    <div style="font-size: 1.1em; font-weight: 900; color: #6d28d9;">${p.revTime.toFixed(1)}h</div>
                    <div style="font-size: 0.7em; color: #777; margin-top: 4px;">${p.revCount} Tasks</div>
                </div>
            </div>
            ` : ''}

            ${type === 'test' ? `
            <div style="background: #f0f7ff; border-radius: 8px; padding: 10px; border-left: 4px solid #1565c0;">
                <div style="font-size: 0.8em; color: #1565c0; font-weight: bold;">🔎 QUALITY REVIEWS FOUND</div>
                <div style="font-size: 1.2em; font-weight: 900; color: #1565c0;">${p.revTime.toFixed(1)}h <span style="font-weight:normal; font-size:0.6em;">(${p.revCount} Items)</span></div>
            </div>
            ` : ''}
        </div>`;
    }).join('');
}

function renderNotTestedView() {
    const container = document.getElementById('not-tested-view');
    // تصفية القصص التي لم تختبر بعد
    const notTested = processedStories.filter(us => us.status !== 'Tested');
    const grouped = groupBy(notTested, 'businessArea');
    
    let html = '<h2>Not Yet Tested - Detailed Analysis</h2>';
    
    if (notTested.length === 0) {
        html += '<div class="card"><p style="text-align:center; color: #27ae60; font-weight: bold;">✅ All Stories are Tested!</p></div>';
        container.innerHTML = html;
        return;
    }

    const formatDate = (date) => {
        if (!date || isNaN(new Date(date))) return 'N/A';
        return new Date(date).toLocaleString('en-GB', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'});
    };

    for (let area in grouped) {
        html += `<div class="business-section"><h3 class="business-area-title">${area}</h3>`;
        
        grouped[area].forEach(us => {
            // ترتيب المهام (نفس المنطق المستخدم في البزنس فيو)
            const devTasksSorted = us.tasks
                .filter(t => t.Activity !== 'Testing')
                .sort((a, b) => new Date(a['Activated Date'] || 0) - new Date(b['Activated Date'] || 0));

            const testingTasksSorted = us.tasks
                .filter(t => t.Activity === 'Testing')
                .sort((a, b) => parseInt(a.id || 0) - parseInt(b.id || 0));

            const sortedTasks = [...devTasksSorted, ...testingTasksSorted];

            html += `
                <div class="card" style="margin-bottom: 30px; border-left: 5px solid #e67e22; overflow-x: auto;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <h4>ID: ${us.id} - ${us.title}</h4>
                        <span style="background: #eee; padding: 2px 8px; border-radius: 4px; font-size: 0.8em;">Status: <b>${us.status}</b></span>
                    </div>
                    <p><b>Dev Lead:</b> ${us.devLead} | <b>Tester Lead:</b> ${us.testerLead}</p>
                    
                    <table>
                        <thead>
                            <tr><th>Type</th><th>Est. (H)</th><th>Actual (H)</th><th>Effort Variance</th></tr>
                        </thead>
                        <tbody>
                            <tr><td>Dev</td><td>${us.devEffort.orig}</td><td>${us.devEffort.actual}</td><td class="${us.devEffort.dev < 1 ? 'alert-red' : ''}">${us.devEffort.dev.toFixed(2)}</td></tr>
                            <tr><td>Test</td><td>${us.testEffort.orig}</td><td>${us.testEffort.actual}</td><td class="${us.testEffort.dev < 1 ? 'alert-red' : ''}">${us.testEffort.dev.toFixed(2)}</td></tr>
                        </tbody>
                    </table>

                    <h5 style="margin: 10px 0;">Tasks Timeline:</h5>
                    <table style="font-size: 0.85em; width: 100%;">
                        <thead>
                            <tr style="background:#eee;">
                                <th>ID</th><th>Task Name</th><th>Activity</th><th>Est</th><th>Exp. Start</th><th>Exp. End</th><th>Act. Start</th><th>TS Total</th><th>Delay</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${sortedTasks.map(t => {
                                const tsTotal = (parseFloat(t['TimeSheet_DevActualTime']) || 0) + (parseFloat(t['TimeSheet_TestingActualTime']) || 0);
                                const est = parseFloat(t['Original Estimation']) || 0;
                                const delay = calculateHourDiff(t.expectedStart, t['Activated Date']);
                                return `
                                <tr>
                                    <td>${t['ID']}</td>
                                    <td style="max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${t['Title']}">${t['Title'] || 'N/A'}</td>
                                    <td>${t['Activity']}</td>
                                    <td>${est}</td>
                                    <td>${formatDate(t.expectedStart)}</td>
                                    <td>${formatDate(t.expectedEnd)}</td>
                                    <td>${formatDate(t['Activated Date'])}</td>
                                    <td>${tsTotal}</td>
                                    <td class="${delay > 0 ? 'alert-red' : ''}">${delay}h</td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>`;
        });
        html += `</div>`;
}
    container.innerHTML = html;
}

// دالة التجميع (Helper Function)
function groupBy(arr, key) {
    return arr.reduce((acc, obj) => {
        (acc[obj[key]] = acc[obj[key]] || []).push(obj);
        return acc;
    }, {});
}
function renderIterationView() {
    const container = document.getElementById('iteration-view');
    if (!processedStories || processedStories.length === 0) {
        container.innerHTML = "<div class='card'><h2>Iteration Summary</h2><p>No data available.</p></div>";
        return;
    }

    // 1. تجميع البيانات الشامل (Global Aggregation)
    let globalStats = {
        totalStories: processedStories.length,
        totalEst: 0, 
        totalAct: 0,
        reworkHrs: 0, 
        reviewHrs: 0,
        totalCycleTime: 0, 
        ctCount: 0,
        sev: { crit: 0, high: 0, med: 0, low: 0, totalItems: 0 }
    };

    processedStories.forEach(us => {
        // حساب المخطط الشامل (Dev + Test + DB)
        const storyEst = us.devEffort.orig + us.testEffort.orig + (us.dbEffort?.orig || 0);
        
        // حساب الفعلي الشامل (Actual + Rework + Reviews)
        const storyReviewTime = (us.reviewStats.devActual + us.reviewStats.testActual);
        const storyAct = us.devEffort.actual + us.testEffort.actual + (us.dbEffort?.actual || 0) + 
                         us.rework.actualTime + storyReviewTime;

        globalStats.totalEst += storyEst;
        globalStats.totalAct += storyAct;
        globalStats.reworkHrs += us.rework.actualTime;
        globalStats.reviewHrs += storyReviewTime;

        if (us.cycleTime > 0) {
            globalStats.totalCycleTime += us.cycleTime;
            globalStats.ctCount++;
        }

        // تجميع Severity للبجات والمراجعات
        const bugs = us.rework.severity;
        const revs = us.reviewStats.severity;
        globalStats.sev.crit += (bugs.critical + revs.critical);
        globalStats.sev.high += (bugs.high + revs.high);
        globalStats.sev.med += (bugs.medium + revs.medium);
        globalStats.sev.low += (bugs.low + revs.low);
    });

    globalStats.sev.totalItems = globalStats.sev.crit + globalStats.sev.high + globalStats.sev.med + globalStats.sev.low;

    // 2. الحسابات الرئيسية
    const effortVariance = ((globalStats.totalAct - globalStats.totalEst) / (globalStats.totalEst || 1)) * 100;
    const combinedReworkRatio = ((globalStats.reworkHrs + globalStats.reviewHrs) / (globalStats.totalAct || 1)) * 100;
    const avgCycleTime = globalStats.ctCount > 0 ? (globalStats.totalCycleTime / globalStats.ctCount).toFixed(1) : 0;

    const getSevPct = (val) => globalStats.sev.totalItems > 0 ? ((val / globalStats.sev.totalItems) * 100).toFixed(1) : 0;

    // 3. بناء الواجهة
    let html = `
    <div style="direction: ltr; text-align: left; font-family: 'Segoe UI', Tahoma, sans-serif; padding: 10px;">
        <h2 style="color: #2c3e50; border-left: 5px solid #3498db; padding-left: 15px; margin-bottom: 25px;">Team-Wide Iteration Insights (Comprehensive)</h2>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 30px;">
            
            <div style="background: white; border-radius: 12px; padding: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border-top: 4px solid ${effortVariance <= 15 ? '#27ae60' : '#e74c3c'};">
                <div style="color: #7f8c8d; font-size: 0.85em; font-weight: bold; margin-bottom: 10px;">EFFORT VARIANCE (FULL)</div>
                <div style="font-size: 2.2em; font-weight: bold; color: ${effortVariance <= 15 ? '#27ae60' : '#e74c3c'};">${effortVariance.toFixed(1)}%</div>
                <div style="font-size: 0.8em; color: #95a5a6; margin-top: 5px;">Includes Core Work + DB + Quality</div>
            </div>

            <div style="background: white; border-radius: 12px; padding: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border-top: 4px solid #f39c12;">
                <div style="color: #7f8c8d; font-size: 0.85em; font-weight: bold; margin-bottom: 10px;">REWORK RATIO (TOTAL)</div>
                <div style="font-size: 2.2em; font-weight: bold; color: #e67e22;">${combinedReworkRatio.toFixed(1)}%</div>
                <div style="font-size: 0.8em; color: #95a5a6; margin-top: 5px;">${(globalStats.reworkHrs + globalStats.reviewHrs).toFixed(1)} Quality Hours</div>
            </div>

            <div style="background: white; border-radius: 12px; padding: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border-top: 4px solid #3498db;">
                <div style="color: #7f8c8d; font-size: 0.85em; font-weight: bold; margin-bottom: 10px;">AVG CYCLE TIME</div>
                <div style="font-size: 2.2em; font-weight: bold; color: #2980b9;">${avgCycleTime} <span style="font-size: 0.5em;">Days</span></div>
                <div style="font-size: 0.8em; color: #95a5a6; margin-top: 5px;">From Activation to Completion</div>
            </div>
        </div>

        <div style="background: white; border-radius: 12px; padding: 25px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); margin-bottom: 30px;">
            <h4 style="margin: 0 0 20px 0; color: #34495e; font-size: 1.1em;">Defect Severity Distribution (Bugs + Reviews)</h4>
            <div style="display: flex; height: 40px; border-radius: 8px; overflow: hidden; margin-bottom: 20px;">
                <div title="Critical" style="width: ${getSevPct(globalStats.sev.crit)}%; background: #c0392b; display: flex; align-items: center; justify-content: center; color: white; font-size: 0.8em;">${getSevPct(globalStats.sev.crit)}%</div>
                <div title="High" style="width: ${getSevPct(globalStats.sev.high)}%; background: #e67e22; display: flex; align-items: center; justify-content: center; color: white; font-size: 0.8em;">${getSevPct(globalStats.sev.high)}%</div>
                <div title="Medium" style="width: ${getSevPct(globalStats.sev.med)}%; background: #f1c40f; display: flex; align-items: center; justify-content: center; color: #2c3e50; font-size: 0.8em;">${getSevPct(globalStats.sev.med)}%</div>
                <div title="Low" style="width: ${getSevPct(globalStats.sev.low)}%; background: #2ecc71; display: flex; align-items: center; justify-content: center; color: white; font-size: 0.8em;">${getSevPct(globalStats.sev.low)}%</div>
            </div>
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; text-align: center;">
                <div><b style="color:#c0392b;">Critical:</b> ${globalStats.sev.crit}</div>
                <div><b style="color:#e67e22;">High:</b> ${globalStats.sev.high}</div>
                <div><b style="color:#f39c12;">Medium:</b> ${globalStats.sev.med}</div>
                <div><b style="color:#27ae60;">Low:</b> ${globalStats.sev.low}</div>
            </div>
        </div>

        <div style="background: white; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); overflow: hidden;">
            <table style="width: 100%; border-collapse: collapse; font-size: 0.9em;">
                <thead style="background: #f8f9fa;">
                    <tr style="text-align: left; border-bottom: 2px solid #edf2f7;">
                        <th style="padding: 15px;">Business Area</th>
                        <th style="padding: 15px;">Stories</th>
                        <th style="padding: 15px;">Est (Core)</th>
                        <th style="padding: 15px;">Act (Total)</th>
                        <th style="padding: 15px;">Effort Var.</th>
                        <th style="padding: 15px;">Rework Ratio</th>
                    </tr>
                </thead>
                <tbody>`;

    const grouped = groupBy(processedStories, 'businessArea');
    for (let area in grouped) {
        const areaStories = grouped[area];
        let a = { est: 0, act: 0, rw: 0, rv: 0 };
        
        areaStories.forEach(s => {
            const sEst = s.devEffort.orig + s.testEffort.orig + (s.dbEffort?.orig || 0);
            const sRv = (s.reviewStats.devActual + s.reviewStats.testActual);
            const sAct = s.devEffort.actual + s.testEffort.actual + (s.dbEffort?.actual || 0) + s.rework.actualTime + sRv;
            
            a.est += sEst; a.act += sAct; a.rw += s.rework.actualTime; a.rv += sRv;
        });

        const aVar = ((a.act - a.est) / (a.est || 1)) * 100;
        const aRwRatio = ((a.rw + a.rv) / (a.act || 1)) * 100;

        html += `
            <tr style="border-bottom: 1px solid #edf2f7;">
                <td style="padding: 15px; font-weight: 600;">${area}</td>
                <td style="padding: 15px;">${areaStories.length}</td>
                <td style="padding: 15px;">${a.est.toFixed(1)}h</td>
                <td style="padding: 15px;">${a.act.toFixed(1)}h</td>
                <td style="padding: 15px; color: ${aVar > 15 ? '#e74c3c' : '#27ae60'}; font-weight: bold;">${aVar.toFixed(1)}%</td>
                <td style="padding: 15px; color: ${aRwRatio > 15 ? '#e67e22' : '#27ae60'}; font-weight: bold;">${aRwRatio.toFixed(1)}%</td>
            </tr>`;
    }

    html += `</tbody></table></div></div>`;
    container.innerHTML = html;
}

function addHoliday() {
    const picker = document.getElementById('holidayPicker');
    const date = picker.value;
    if (date && !holidays.includes(date)) {
        holidays.push(date);
        localStorage.setItem('holidays', JSON.stringify(holidays));
        renderHolidays();
        picker.value = '';
    }
}

function calculateCycleTimeDays(startDate, endDate) {
    if (!startDate || !endDate || isNaN(new Date(startDate)) || isNaN(new Date(endDate))) return 0;
    
    let start = new Date(startDate);
    let end = new Date(endDate);
    if (end < start) return 0;

    let days = 0;
    let current = new Date(start);
    current.setHours(0, 0, 0, 0);
    let finalEnd = new Date(end);
    finalEnd.setHours(0, 0, 0, 0);

    while (current <= finalEnd) {
        const dayOfWeek = current.getDay(); // 5 للجمعة و 6 للسبت
        const dateString = current.toISOString().split('T')[0];
        
        // استثناء الجمعة (5) والسبت (6) والعطلات المسجلة في مصفوفة holidays
        if (dayOfWeek !== 5 && dayOfWeek !== 6 && !holidays.includes(dateString)) {
            days++;
        }
        current.setDate(current.getDate() + 1);
    }
    return days;
}


function removeHoliday(date) {
    holidays = holidays.filter(h => h !== date);
    localStorage.setItem('holidays', JSON.stringify(holidays));
    renderHolidays();
}

renderHolidays();

// المتغيرات الجديدة
let azureConfigs = []; // تغيير من "" إلى مصفوفة فارغة لتجنب أخطاء الـ map
let azureConfigsSha = "";
let azurePAT = localStorage.getItem('az_pat') || "";

function renderAzureSelect() {
    const select = document.getElementById('azureConfigSelect');
    if (!select) return;

    select.innerHTML = '<option value="">-- Select Iteration --</option>' + 
    azureConfigs.map((config, index) => {
        const valObj = JSON.stringify({
            org: config.org || "",
            project: config.project || "",
            queryId: config.id || ""
        });
        return `<option value='${valObj}'>${config.name || 'Unnamed Query'}</option>`;
    }).join('');
}

// 1. تحديث دالة الدخول
const originalAttemptLogin = attemptLogin;
attemptLogin = async function() {
    const pat = document.getElementById('azurePatInput').value;
    const remember = document.getElementById('rememberMe').checked;
    if (remember) localStorage.setItem('az_pat', pat);
    azurePAT = pat;
    
    await originalAttemptLogin();
    // تأكد من تحميل الإعدادات بعد الدخول بنجاح
    await loadConfigsFromCloud(); 
};

// 2. إضافة إعداد جديد
async function addAzureConfig() {
    const config = {
        id: document.getElementById('azQueryId').value, // تغيير queryId لـ id ليتناسب مع renderAzureDropdown
        name: document.getElementById('azQueryName').value, // تغيير accountName لـ name
        org: document.getElementById('azOrg').value,
        project: document.getElementById('azProject').value
    };

    if (!config.id || !config.name) return alert("Please fill all fields");

    try {
        // جلب أحدث نسخة لضمان الـ SHA
        await loadConfigsFromCloud();
        
        const updatedConfigs = [...azureConfigs, config];

        const updateResponse = await fetch(`https://api.github.com/repos/${GH_CONFIG.owner}/${GH_CONFIG.repo}/contents/azure_configs.json`, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${githubToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: "Add Azure Config",
                content: btoa(unescape(encodeURIComponent(JSON.stringify(updatedConfigs, null, 2)))), // دعم الرموز الخاصة
                sha: azureConfigsSha
            })
        });

        if (updateResponse.ok) {
            alert("تم الحفظ بنجاح!");
            await loadConfigsFromCloud(); // إعادة التحميل لتحديث المصفوفة والـ SHA
        } else {
            throw new Error("Failed to update GitHub");
        }
    } catch (error) {
        alert("خطأ أثناء الحفظ: " + error.message);
    }
}

// 3. حذف إعداد (تعديل جذري للمزامنة مع الكلاود)
async function deleteAzureConfig(index) {
    if (!confirm("هل أنت متأكد من حذف هذا الإعداد من السحابة؟")) return;

    try {
        // 1. إزالة العنصر من المصفوفة المحلية
        const updatedConfigs = [...azureConfigs];
        updatedConfigs.splice(index, 1);

        // 2. تحديث GitHub
        const updateResponse = await fetch(`https://api.github.com/repos/${GH_CONFIG.owner}/${GH_CONFIG.repo}/contents/azure_configs.json`, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${githubToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: "Delete Azure Config",
                content: btoa(unescape(encodeURIComponent(JSON.stringify(updatedConfigs, null, 2)))),
                sha: azureConfigsSha
            })
        });

        if (updateResponse.ok) {
            alert("تم الحذف من السحابة بنجاح");
            await loadConfigsFromCloud();
        } else {
            throw new Error("فشل التحديث في GitHub");
        }
    } catch (error) {
        alert("خطأ أثناء الحذف: " + error.message);
    }
}

// 4. الدوال المساعدة للرسم
function renderAzureDropdown() {
    const sel = document.getElementById('azureQuerySelector');
    if (!sel) return;

    sel.innerHTML = azureConfigs.map(c => {
        const valObj = JSON.stringify({
            org: c.org || "",
            project: c.project || "",
            queryId: c.id || ""
        });
        return `<option value='${valObj}'>${c.name || 'Unnamed Query'}</option>`;
    }).join('');
}

// 5. تحميل البيانات
async function loadConfigsFromCloud() {
    if (!githubToken) return;
    try {
        const response = await fetch(`https://api.github.com/repos/${GH_CONFIG.owner}/${GH_CONFIG.repo}/contents/azure_configs.json`, {
            headers: { 'Authorization': `token ${githubToken}` }
        });
        if (response.ok) {
            const data = await response.json();
            azureConfigsSha = data.sha;
            azureConfigs = JSON.parse(decodeURIComponent(escape(atob(data.content))));
            
            // استدعاء دوال الريندر لتحديث القوائم المنسدلة فوراً بالبيانات السحابية
            updateIterationDropdown();
            if (typeof renderAzureSelect === 'function') renderAzureSelect();
            if (typeof renderAzureDropdown === 'function') renderAzureDropdown();
            if (typeof renderAzureConfigsTable === 'function') renderAzureConfigsTable();
        }
    } catch (error) {
        console.error("Error loading configs from cloud:", error);
    }
}

async function fetchFromAzure() {
    const select = document.getElementById('azureIterationSelect');
    if (!select || select.value === "") return alert("يرجى اختيار الكويري المناسب");

    // استخراج الإعدادات من القيمة المختارة في الـ Dropdown
    const config = JSON.parse(select.value);
    const pat = localStorage.getItem('azure_pat');
    const statusDiv = document.getElementById('sync-status');

    if (!pat) return alert("يرجى إدخال الـ PAT في شاشة الدخول أولاً");

    statusDiv.style.display = 'block';
    statusDiv.innerText = "⏳ جاري الاتصال بـ Azure DevOps...";

    try {
        const authHeader = { 
            'Authorization': 'Basic ' + btoa(':' + pat),
            'Content-Type': 'application/json'
        };

        // 1. جلب قائمة الـ IDs باستخدام الـ WIQL API (الرسمي الذي يسمح بـ CORS)
        const wiqlUrl = `https://dev.azure.com/${config.org}/${config.project}/_apis/wit/wiql/${config.queryId}?api-version=6.0`;
        const wiqlRes = await fetch(wiqlUrl, { headers: authHeader });
        
        if (!wiqlRes.ok) throw new Error(`خطأ في الوصول للكويري: ${wiqlRes.status}`);
        
        const wiqlData = await wiqlRes.json();
        
        let workItemIds = [];
        // التعامل مع الكويري سواء كان روابط (Links) أو قائمة مسطحة (Flat)
        if (wiqlData.workItemRelations) {
            workItemIds = wiqlData.workItemRelations
                .map(rel => rel.target ? rel.target.id : null)
                .filter(id => id !== null);
        } else {
            workItemIds = wiqlData.workItems.map(wi => wi.id);
        }

        if (workItemIds.length === 0) {
            statusDiv.innerText = "⚠️ الكويري لم يرجع أي نتائج.";
            return;
        }

        statusDiv.innerText = `⏳ تم العثور على ${workItemIds.length} عنصر، جاري جلب التفاصيل...`;

        // 2. جلب التفاصيل بنظام الدفعات (Batching) - كل دفعة 200 عنصر
        let allItemsDetails = [];
        for (let i = 0; i < workItemIds.length; i += 200) {
            const chunk = workItemIds.slice(i, i + 200).join(',');
            const detailsUrl = `https://dev.azure.com/${config.org}/${config.project}/_apis/wit/workitems?ids=${chunk}&$expand=all&api-version=6.0`;
            
            const detailsRes = await fetch(detailsUrl, { headers: authHeader });
            const detailsData = await detailsRes.json();
            allItemsDetails = allItemsDetails.concat(detailsData.value);
            
            statusDiv.innerText = `⏳ جاري التحميل: ${allItemsDetails.length} / ${workItemIds.length}`;
        }

        // 3. تحويل البيانات (Mapping) لتطابق الهيكل المطلوب في السايت
        rawData = allItemsDetails.map(item => mapAzureFields(item));

        // تشغيل معالجة البيانات وعرضها
        processData(); 
        statusDiv.innerText = "✅ تم جلب البيانات بنجاح";
        
        if (typeof showView === 'function') showView('iteration-view');

    } catch (error) {
        console.error("Azure Integration Error:", error);
        statusDiv.innerText = "❌ فشل الجلب: " + error.message;
    }
}

// دالة المابينج لتحويل مسميات Azure للمسميات المستخدمة في السايت
function mapAzureFields(item) {
    const f = item.fields;
    return {
        "ID": item.id,
        "Work Item Type": f["System.WorkItemType"],
        "State": f["System.State"],
        "Title": f["System.Title"],
        "Assigned To": f["System.AssignedTo"]?.displayName || f["System.AssignedTo"] || "",
        "Activity": f["Microsoft.VSTS.Common.Activity"] || "",
        "Original Estimation": f["NT.OriginalEstimation"] || 0,
        "TimeSheet_DevActualTime": f["Custom.TimeSheet_DevActualTime"] || 0,
        "TimeSheet_TestingActualTime": f["Custom.TimeSheet_TestingActualTime"] || 0,
        "Activated Date": f["Microsoft.VSTS.Common.ActivatedDate"] || "",
        "Business Area": f["MyCompany.MyProcess.BusinessArea"] || "General",
        "Iteration Path": f["System.IterationPath"] || "",
        "CustomResolvedDate": f["Custom.CustomResolvedDate"] || "",
        "Tested Date": f["MyCompany.MyProcess.TestedDate"] || "",
        "Assigned To Tester": f["MyCompany.MyProcess.Tester"]?.displayName || f["MyCompany.MyProcess.Tester"] || "",
        "Resolved Date": f["Microsoft.VSTS.Common.ResolvedDate"] || "",
        "Severity": f["Microsoft.VSTS.Common.Severity"] || "",
        "GenericBug": f["NT.GenericBug"] || "No",
        "Bug Type": f["NT.Bug_Type"] || ""
    };
}

// استبدل الدالة الموجودة في آخر الملف أو المكررة بهذه النسخة الموحدة
function updateIterationDropdown() {
    const select = document.getElementById('azureIterationSelect');
    if (!select) return;

    // الاعتماد الكلي على المصفوفة السحابية القادمة من الجيت هاب بدلاً من اللوكال استوريدج
    const savedQueries = azureConfigs || [];

    // الواجهة باللغة الإنجليزية بالكامل تماشياً مع معايير الـ UI المعتمدة
    select.innerHTML = '<option value="">-- Select Iteration --</option>';

    savedQueries.forEach(config => {
        const option = document.createElement('option');
        
        // استخدام المسميات الموحدة المطابقة لملف azure_configs.json (id و org)
        option.value = JSON.stringify({
            org: config.org || "",
            project: config.project || "",
            queryId: config.id || "" // ربط الخصائص بطريقة صحيحة للطلب
        });
        
        option.textContent = config.name || `${config.project} - Query`;
        select.appendChild(option);
    });
}
function renderAzureConfigsTable() {
    const tbody = document.getElementById('azureConfigsTableBody'); // تأكد من مطابقة الـ ID في ملف الـ HTML
    if (!tbody) return;

    const savedQueries = azureConfigs || [];

    if (savedQueries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No queries found in cloud configuration.</td></tr>';
        return;
    }

    tbody.innerHTML = savedQueries.map((config, index) => `
        <tr>
            <td>${config.name || 'N/A'}</td>
            <td>${config.org || 'N/A'}</td>
            <td>${config.project || 'N/A'}</td>
            <td>${config.id || 'N/A'}</td>
            <td>
                <button onclick="deleteAzureConfig(${index})" style="background:#e74c3c; padding:5px 10px; color:white; border:none; border-radius:3px; cursor:pointer;">Delete</button>
            </td>
        </tr>
    `).join('');
}
// تشغيل التحميل عند فتح الصفحة
window.addEventListener('load', async () => {
    if (githubToken) await loadConfigsFromCloud();
});
