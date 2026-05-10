// 1. Global Variables (Top Level Scope)
let rawData = [];
let processedStories = [];
let holidays = JSON.parse(localStorage.getItem('holidays') || "[]");
let githubToken = localStorage.getItem('gh_token') || ""; 

// GitHub Configuration
const GH_CONFIG = {
    owner: 'elmoatasemsaeed',
    repo: 'iteration_follow_up-',
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
    const remember = document.getElementById('rememberMe').checked;

    if (!token) return alert("Please enter GitHub Token");

    githubToken = token; // تعيين التوكن مؤقتاً لمحاولة الجلب

    try {
        // محاولة جلب المستخدمين من GitHub أولاً
        await fetchUsersFromGitHub(); 

        if (users[user] && users[user].pass === pass) {
            currentUser = users[user];
            
            if (remember) {
                localStorage.setItem('gh_token', token);
                localStorage.setItem('app_role', currentUser.role);
                localStorage.setItem('saved_user', user);
                localStorage.setItem('saved_pass', pass);
            }

            setupPermissions();
            document.getElementById('login-overlay').style.display = 'none';
            document.getElementById('main-nav').style.display = 'flex';
            await fetchDataFromGitHub();
        } else {
            alert("Invalid Credentials!");
        }
    } catch (e) {
        alert("Login failed: Could not connect to GitHub or invalid Token.");
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
            headers: { 'Authorization': `token ${githubToken}` }
        });

        if (res.ok) {
            const data = await res.json();
            const content = decodeURIComponent(escape(atob(data.content)));
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
            headers: { 'Authorization': `token ${githubToken}` }
        });

        if (res.ok) {
            const data = await res.json();
            // فك تشفير البيانات من Base64
            const content = decodeURIComponent(escape(atob(data.content)));
            rawData = JSON.parse(content);
            processData(); 
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
window.onload = async function() {
    if (githubToken) {
        await fetchUsersFromGitHub();
    }
    
    renderUsersTable();
    renderHolidays();

    const savedToken = localStorage.getItem('gh_token');
    const savedRole = localStorage.getItem('app_role');
    const savedUser = localStorage.getItem('saved_user');

    if (savedToken && savedRole) {
        githubToken = savedToken; // استرجاع التوكن المحفوظ تلقائياً
        document.getElementById('login-overlay').style.display = 'none';
        document.getElementById('main-nav').style.display = 'flex';
        setupPermissions();
        await fetchDataFromGitHub();
    } else if (savedUser) {
        document.getElementById('loginUser').value = savedUser;
        document.getElementById('loginPass').value = localStorage.getItem('saved_pass') || "";
        document.getElementById('ghTokenInput').value = savedToken || "";
    }
};

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
async function handleUpload() {
    const file = document.getElementById('csvFile').files[0];
    
    // التعديل هنا: نستخدم المتغير githubToken الذي تم تعريفه عالمياً وتعبئته عند تسجيل الدخول
    // بدلاً من سحب القيمة من عنصر HTML قد لا يكون موجوداً في هذه الشاشة
    if (!githubToken) {
        return alert("GitHub Token is missing. Please log in again or ensure it's provided.");
    }

    if (!file) return alert("Please select a file first");

    // تخزين التوكن الحالي في LocalStorage لضمان استمراريته
    localStorage.setItem('gh_token', githubToken); 

    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async function(results) {
            rawData = results.data;
            processData(); // الدالة الموجودة مسبقاً
            await uploadToGitHub();
            showView('iteration-view');
        }
    });
}

async function uploadToGitHub() {
    const statusDiv = document.getElementById('sync-status');
    statusDiv.style.display = 'block';
    statusDiv.innerText = "🚀 Uploading to GitHub...";

    const content = btoa(unescape(encodeURIComponent(JSON.stringify(rawData))));
    
    // نحتاج أولاً لمعرفة إذا كان الملف موجوداً للحصول على الـ SHA الخاص به
    let sha = "";
    try {
        const res = await fetch(`https://api.github.com/repos/${GH_CONFIG.owner}/${GH_CONFIG.repo}/contents/${GH_CONFIG.path}`, {
            headers: { 'Authorization': `token ${githubToken}` }
        });
        if (res.ok) {
            const data = await res.json();
            sha = data.sha;
        }
    } catch (e) {}

    const response = await fetch(`https://api.github.com/repos/${GH_CONFIG.owner}/${GH_CONFIG.repo}/contents/${GH_CONFIG.path}`, {
        method: 'PUT',
        headers: {
            'Authorization': `token ${githubToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            message: "Update productivity data",
            content: content,
            sha: sha, // ضروري لتحديث ملف موجود
            branch: GH_CONFIG.branch
        })
    });

    if (response.ok) {
        statusDiv.innerText = "✅ Successfully synced to GitHub!";
    } else {
        alert("Error uploading to GitHub. Check your token and repo permissions.");
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
            const actDev = parseFloat(t['TimeSheet_DevActualTime']) || 0; // التأكد من تعريف actDev هنا
            const actTest = parseFloat(t['TimeSheet_TestingActualTime']) || 0;
            const activity = t['Activity'];

            if (activity === 'DB Modification') {
                dbOrig += orig;
                dbActual += actDev; // الآن actDev معرف ولن يظهر الخطأ
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

// داخل دالة calculateMetrics، استبدل الجزء الخاص بحساب الـ Rework بهذا الكود:
let bugOrig = 0, bugActualTotal = 0, bugsNoTimesheet = 0;
us.severityCounts = { critical: 0, high: 0, medium: 0, low: 0 };

// إضافة كائنات لتخزين تفاصيل الـ Generic والـ Specific بشكل منفصل
// 1. تعريف الهيكل الجديد مع إضافة كائن severity رئيسي للتوافق مع الشاشات الأخرى
us.rework = {
    generic: { count: 0, actualTime: 0, severity: { critical: 0, high: 0, medium: 0, low: 0 } },
    specific: { count: 0, actualTime: 0, severity: { critical: 0, high: 0, medium: 0, low: 0 } },
    severity: { critical: 0, high: 0, medium: 0, low: 0 }, // هذا السطر يحل مشكلة الـ TypeError
    timeEstimation: 0,
    actualTime: 0,
    count: 0
};

us.bugs.forEach(b => {
    const isGeneric = (b['GenericBug'] || "").trim().toLowerCase() === 'yes';
    const bDevAct = parseFloat(b['TimeSheet_DevActualTime']) || 0;
    const bEst = parseFloat(b['Original Estimation']) || 0;
    const sev = b['Severity'] || "";

    bugOrig += bEst;
    bugActualTotal += bDevAct;
    if (bDevAct === 0) bugsNoTimesheet++;

    const target = isGeneric ? us.rework.generic : us.rework.specific;
    target.count++;
    target.actualTime += bDevAct;

    // 2. تحديث السيفيرتي في الكائن الخاص (للعرض المفصل) وفي الكائن الرئيسي (لحل الخطأ)
    if (sev.includes("1 - Critical")) { 
        target.severity.critical++; 
        us.rework.severity.critical++; // إضافة هنا
        us.severityCounts.critical++; 
    }
    else if (sev.includes("2 - High")) { 
        target.severity.high++; 
        us.rework.severity.high++; // إضافة هنا
        us.severityCounts.high++; 
    }
    else if (sev.includes("3 - Medium")) { 
        target.severity.medium++; 
        us.rework.severity.medium++; // إضافة هنا
        us.severityCounts.medium++; 
    }
    else if (sev.includes("4 - Low")) { 
        target.severity.low++; 
        us.rework.severity.low++; // إضافة هنا
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
        

        // 3. حساب الـ Review (الطلب الجديد)
us.reviewStats = {
    estimation: 0,
    devActual: 0, 
    testActual: 0,
    totalActual: 0, // سيتم تحديثه في النهاية
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
    let html = `
    <div style="direction: ltr; text-align: left; font-family: 'Segoe UI', Tahoma, sans-serif;">
        <h2 style="margin-bottom:30px; color: #2c3e50; border-left: 6px solid #2ecc71; padding-left: 20px; font-size: 1.8em;">
            🚀 Team Performance Analytics (Unified Scope)
        </h2>`;

    for (let area in grouped) {
        let stats = {
            totalEst: 0, totalAct: 0,
            reworkTime: 0, reviewTime: 0,
            bugsCount: 0, bugsCrit: 0, bugsHigh: 0, bugsMed: 0, bugsLow: 0,
            reviewCount: 0, revCrit: 0, revHigh: 0, revMed: 0, revLow: 0,
            totalStories: grouped[area].length,
            totalCycleTime: 0,
            // متغيرات مؤشر IPQ
            totalBugsForIPQ: 0,
            nonClosedBugs: 0,
            nonClosedBugIDs: [] // مصفوفة لتخزين أرقام البجز غير المغلقة
        };

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

            // حساب بيانات IPQ وتجميع أرقام الـ IDs للبجات غير المغلقة
            if (us.bugs && us.bugs.length > 0) {
                stats.totalBugsForIPQ += us.bugs.length;
                const nonClosed = us.bugs.filter(b => b['State'] !== 'Closed' && b['State'] !== 'Cancel');
                stats.nonClosedBugs += nonClosed.length;
                nonClosed.forEach(b => {
                    if (b['ID']) stats.nonClosedBugIDs.push(b['ID']);
                });
            }
        });

        const effortVariance = stats.totalEst > 0 ? ((stats.totalAct - stats.totalEst) / stats.totalEst) * 100 : 0;
        const combinedReworkRatio = ((stats.reworkTime + stats.reviewTime) / (stats.totalAct || 1)) * 100;
        const avgCycleTime = (stats.totalCycleTime / stats.totalStories).toFixed(1);
        
        // حساب مؤشر IPQ
        const ipqValueNum = stats.totalBugsForIPQ > 0 ? ((stats.nonClosedBugs / stats.totalBugsForIPQ) * 100) : 0;
        const ipqValue = ipqValueNum.toFixed(1);

        const varianceColor = effortVariance <= 15 ? '#2e7d32' : '#d32f2f';
        const reworkColor = combinedReworkRatio > 15 ? '#d32f2f' : '#2e7d32';
        const ipqColor = ipqValueNum > 0 ? '#d32f2f' : '#2e7d32';

        const getSevBadges = (c, h, m, l, t) => {
            if (!t) return '<div style="color:#999; margin-top:5px; font-size:0.8em;">No items recorded</div>';
            const pct = (v) => ((v / t) * 100).toFixed(0);
            const badgeStyle = (bg, color, border) => ` background:${bg}; color:${color}; padding:10px 5px; border-radius:10px; text-align:center; flex:1; border:1px solid ${border}; display: flex; flex-direction: column; justify-content: center;`;
            return `
            <div style="display: flex; gap: 8px; margin-top: 10px;">
                <div style="${badgeStyle('#ffeaed', '#c62828', '#ffcdd2')}">
                    <div style="font-size:0.6em; font-weight:bold; opacity:0.8;">CRIT</div>
                    <div style="font-size:1.4em; font-weight:900; line-height:1;">${pct(c)}%</div>
                    <div style="font-size:0.75em; margin-top:2px; font-weight:bold;">${c}</div>
                </div>
                <div style="${badgeStyle('#fff3e0', '#ef6c00', '#ffe0b2')}">
                    <div style="font-size:0.6em; font-weight:bold; opacity:0.8;">HIGH</div>
                    <div style="font-size:1.4em; font-weight:900; line-height:1;">${pct(h)}%</div>
                    <div style="font-size:0.75em; margin-top:2px; font-weight:bold;">${h}</div>
                </div>
                <div style="${badgeStyle('#e8f5e9', '#2e7d32', '#c8e6c9')}">
                    <div style="font-size:0.6em; font-weight:bold; opacity:0.8;">MED</div>
                    <div style="font-size:1.4em; font-weight:900; line-height:1;">${pct(m)}%</div>
                    <div style="font-size:0.75em; margin-top:2px; font-weight:bold;">${m}</div>
                </div>
                <div style="${badgeStyle('#e3f2fd', '#1565c0', '#bbdefb')}">
                    <div style="font-size:0.6em; font-weight:bold; opacity:0.8;">LOW</div>
                    <div style="font-size:1.4em; font-weight:900; line-height:1;">${pct(l)}%</div>
                    <div style="font-size:0.75em; margin-top:2px; font-weight:bold;">${l}</div>
                </div>
            </div>`;
        };

        html += `
        <div class="business-section" style="margin-bottom: 50px; background: white; border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); overflow: hidden;">
            <div style="background: #2c3e50; color: white; padding: 18px 25px; display: flex; justify-content: space-between; align-items: center;">
                <h3 style="margin:0; font-size: 1.5em;">📍 Area: ${area}</h3>
            </div>
            <div style="padding: 25px;">
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px;">
                    <div style="background: ${varianceColor}0a; border: 2px solid ${varianceColor}; border-radius: 12px; padding: 20px; text-align: center;">
                        <span style="font-size: 0.85em; color: #555; font-weight: bold; text-transform: uppercase;">Effort Variance</span>
                        <div style="font-size: 2.5em; font-weight: 900; color: ${varianceColor}; margin: 10px 0;">${effortVariance.toFixed(1)}%</div>
                        <div style="font-size: 0.75em; color: white; background: ${varianceColor}; padding: 3px 12px; border-radius: 15px; display: inline-block;">
                            ${effortVariance <= 15 ? '🎯 Within Plan' : '⚠️ Delay'}
                        </div>
                    </div>
                    <div style="background: ${reworkColor}0a; border: 2px solid ${reworkColor}; border-radius: 12px; padding: 20px; text-align: center;">
                        <span style="font-size: 0.85em; color: #555; font-weight: bold; text-transform: uppercase;">Rework Ratio</span>
                        <div style="font-size: 2.5em; font-weight: 900; color: ${reworkColor}; margin: 10px 0;">${combinedReworkRatio.toFixed(1)}%</div>
                        <div style="font-size: 0.75em; color: white; background: ${reworkColor}; padding: 3px 12px; border-radius: 15px; display: inline-block;">
                            ${(stats.reworkTime + stats.reviewTime).toFixed(1)}h Loss
                        </div>
                    </div>
                    <div style="background: ${ipqColor}0a; border: 2px solid ${ipqColor}; border-radius: 12px; padding: 20px; text-align: center;">
                        <span style="font-size: 0.85em; color: #555; font-weight: bold; text-transform: uppercase;">Open Testing Bugs</span>
                        <div style="font-size: 2.5em; font-weight: 900; color: ${ipqColor}; margin: 10px 0; line-height: 1.1;">
                            ${ipqValue}%
                            ${ipqValueNum > 0 ? `<div style="font-size: 0.35em; font-weight: normal; color: #666; margin-top: 5px; word-break: break-all;">IDs: ${stats.nonClosedBugIDs.join(', ')}</div>` : ''}
                        </div>
                        <div style="font-size: 0.75em; color: white; background: ${ipqColor}; padding: 3px 12px; border-radius: 15px; display: inline-block;">
                            Target: 0% Non-Closed
                        </div>
                    </div>
                    <div style="background: #e3f2fd; border: 2px solid #1565c0; border-radius: 12px; padding: 20px; text-align: center;">
                        <span style="font-size: 0.85em; color: #1565c0; font-weight: bold; text-transform: uppercase;">Avg Cycle Time</span>
                        <div style="font-size: 2.5em; font-weight: 900; color: #1565c0; margin: 10px 0;">${avgCycleTime}</div>
                        <div style="font-size: 0.8em; color: #1565c0; font-weight: bold;">Days / Story</div>
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 25px;">
                    <div style="background: #fff; border: 1px solid #eee; padding: 20px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.02);">
                        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #f8d7da; padding-bottom: 8px; margin-bottom: 12px;">
                            <h5 style="margin:0; color: #c62828; font-size: 1.1em;">Standard Bugs</h5>
                            <b style="font-size: 1.2em; color: #c62828;">${stats.bugsCount} <small style="font-size:0.6em; color:#666;">(${stats.reworkTime.toFixed(1)}h)</small></b>
                        </div>
                        ${getSevBadges(stats.bugsCrit, stats.bugsHigh, stats.bugsMed, stats.bugsLow, stats.bugsCount)}
                    </div>
                    <div style="background: #fff; border: 1px solid #eee; padding: 20px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.02);">
                        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e2e3e5; padding-bottom: 8px; margin-bottom: 12px;">
                            <h5 style="margin:0; color: #383d41; font-size: 1.1em;">Reviews Items</h5>
                            <b style="font-size: 1.2em; color: #383d41;">${stats.reviewCount} <small style="font-size:0.6em; color:#666;">(${stats.reviewTime.toFixed(1)}h)</small></b>
                        </div>
                        ${getSevBadges(stats.revCrit, stats.revHigh, stats.revMed, stats.revLow, stats.reviewCount)}
                    </div>
                </div>
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

