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
    usersPath: 'users.json',
    branch: 'main'
};

// Initialize Users
let users = JSON.parse(localStorage.getItem('app_users'));
if (!users || Object.keys(users).length === 0) {
    users = {
        "admin": { pass: "admin", role: "admin" }
    };
    localStorage.setItem('app_users', JSON.stringify(users));
}

let currentUser = null;

// Azure configs (for historical sync)
let azureConfigs = [];
let azureConfigsSha = "";
let azurePAT = localStorage.getItem('az_pat') || "";

// Chart instances for historical view
let cycleTimeChart = null;
let storiesBugsChart = null;

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
        
        if (remember) {
            localStorage.setItem('gh_token', token);
            localStorage.setItem('azure_pat', azurePat);
            localStorage.setItem('saved_user', user);
            localStorage.setItem('saved_pass', pass);
            localStorage.setItem('app_role', currentUser.role);
        } else {
            localStorage.removeItem('gh_token');
            localStorage.removeItem('azure_pat');
            localStorage.removeItem('saved_user');
            localStorage.removeItem('saved_pass');
        }

        githubToken = token;
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
        localStorage.setItem('app_users', JSON.stringify(users)); 
        await uploadUsersToGitHub(); 
        alert("User saved and synced to GitHub!");
        document.getElementById('newUserName').value = '';
        document.getElementById('newUserPass').value = '';
        renderUsersTable();
    }
}

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

async function uploadUsersToGitHub() {
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

function setupPermissions() {
    const role = localStorage.getItem('app_role') || (currentUser ? currentUser.role : null);
    const adminElements = document.querySelectorAll('.admin-only');
    adminElements.forEach(el => {
        if (role === 'admin') {
            el.style.setProperty('display', 'inline-block', 'important');
        } else {
            el.style.setProperty('display', 'none', 'important');
        }
    });
}

async function fetchDataFromGitHub() {
    const statusDiv = document.getElementById('sync-status');
    statusDiv.style.display = 'block';
    statusDiv.innerText = "🔍 Fetching data from GitHub...";
    try {
        const res = await fetch(`https://api.github.com/repos/${GH_CONFIG.owner}/${GH_CONFIG.repo}/contents/${GH_CONFIG.path}`, {
            headers: { 
                'Authorization': `token ${githubToken}`,
                'Accept': 'application/vnd.github.v3.raw'
            }
        });
        if (res.ok) {
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

function logout() {
    localStorage.removeItem('gh_token');
    localStorage.removeItem('app_role');
    localStorage.removeItem('saved_user');
    localStorage.removeItem('saved_pass');
    location.reload();
}

// ==================== DATA PROCESSING (Existing, unchanged) ====================
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
        us.rework = {
            generic: { count: 0, actualTime: 0, severity: { critical: 0, high: 0, medium: 0, low: 0 } },
            specific: { count: 0, actualTime: 0, severity: { critical: 0, high: 0, medium: 0, low: 0 } },
            severity: { critical: 0, high: 0, medium: 0, low: 0 }, 
            timeEstimation: 0,
            actualTime: 0,
            count: 0,
            uatBugsCount: 0,
            iterationBugsCount: 0
        };

        us.bugs.forEach(b => {
            const isGeneric = (b['GenericBug'] || "").trim().toLowerCase() === 'yes';
            const bDevAct = parseFloat(b['TimeSheet_DevActualTime']) || 0;
            const bEst = parseFloat(b['Original Estimation']) || 0;
            const sev = b['Severity'] || "";
            const bugType = (b['BugType'] || "").trim().toUpperCase();

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

        us.rework.timeEstimation = bugOrig;
        us.rework.actualTime = bugActualTotal;
        us.rework.count = us.bugs.length;
        us.rework.missingTimesheet = bugsNoTimesheet;
        us.rework.deviation = bugOrig / (bugActualTotal || 1);
        us.rework.percentage = (bugActualTotal / (us.devEffort.actual || 1)) * 100;
        
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

    devTasks.sort((a, b) => {
        let dateA = new Date(a['Activated Date'] || 0);
        let dateB = new Date(b['Activated Date'] || 0);
        return dateA - dateB;
    });

    let lastDevExpectedEnd;
    let lastDevActualEnd = null;

    devTasks.forEach((t, index) => {
        let hours = parseFloat(t['Original Estimation']) || 0;
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

    testingTasks.sort((a, b) => parseInt(a.id || 0) - parseInt(b.id || 0));

    let lastTestExpectedEnd = null;

    testingTasks.forEach((t, index) => {
        let hours = parseFloat(t['Original Estimation']) || 0;
        
        if (index === 0) {
            let taskAct = t['Activated Date'] ? new Date(t['Activated Date']) : new Date(us.activatedDate);
            t.expectedStart = isValidDate(taskAct) ? taskAct : new Date();
        } 
        else if (index === 1) {
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
    let remainingMinutes = hours * 60;

    while (remainingMinutes > 0) {
        if (date.getDay() === 5 || date.getDay() === 6 || holidays.includes(date.toISOString().split('T')[0])) {
            date.setDate(date.getDate() + 1);
            date.setHours(9, 0, 0, 0);
            continue;
        }

        let currentHour = date.getHours();
        let currentMinutes = date.getMinutes();
        let minutesUntilEndOfDay = ((17 - currentHour) * 60) - currentMinutes;

        let addedNow = Math.min(remainingMinutes, minutesUntilEndOfDay);
        date.setTime(date.getTime() + (addedNow * 60 * 1000));
        remainingMinutes -= addedNow;

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
    
    if (actualDate <= startDate) return 0;

    let totalDiffMinutes = 0;
    let current = new Date(startDate);

    while (current < actualDate) {
        let dayEnd = new Date(current);
        dayEnd.setHours(17, 0, 0, 0);

        if (current.getDay() !== 5 && current.getDay() !== 6 && !holidays.includes(current.toISOString().split('T')[0])) {
            let endOfPeriod = actualDate < dayEnd ? actualDate : dayEnd;
            let diff = (endOfPeriod - current) / (1000 * 60);
            if (diff > 0) totalDiffMinutes += diff;
        }

        current.setDate(current.getDate() + 1);
        current.setHours(9, 0, 0, 0);
    }

    return (totalDiffMinutes / 60).toFixed(1);
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
        const dayOfWeek = current.getDay();
        const dateString = current.toISOString().split('T')[0];
        
        if (dayOfWeek !== 5 && dayOfWeek !== 6 && !holidays.includes(dateString)) {
            days++;
        }
        current.setDate(current.getDate() + 1);
    }
    return days;
}

// ==================== RENDERING FUNCTIONS (Existing, unchanged) ====================

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
        const storyEst = us.devEffort.orig + us.testEffort.orig + (us.dbEffort?.orig || 0);
        const storyReviewTime = (us.reviewStats.devActual + us.reviewStats.testActual);
        const storyAct = us.devEffort.actual + us.testEffort.actual + (us.dbEffort?.actual || 0) + us.rework.actualTime + storyReviewTime;

        globalStats.totalEst += storyEst;
        globalStats.totalAct += storyAct;
        globalStats.reworkHrs += us.rework.actualTime;
        globalStats.reviewHrs += storyReviewTime;

        if (us.cycleTime > 0) {
            globalStats.totalCycleTime += us.cycleTime;
            globalStats.ctCount++;
        }

        const bugs = us.rework.severity;
        const revs = us.reviewStats.severity;
        globalStats.sev.crit += (bugs.critical + revs.critical);
        globalStats.sev.high += (bugs.high + revs.high);
        globalStats.sev.med += (bugs.medium + revs.medium);
        globalStats.sev.low += (bugs.low + revs.low);
    });

    globalStats.sev.totalItems = globalStats.sev.crit + globalStats.sev.high + globalStats.sev.med + globalStats.sev.low;

    const effortVariance = ((globalStats.totalAct - globalStats.totalEst) / (globalStats.totalEst || 1)) * 100;
    const combinedReworkRatio = ((globalStats.reworkHrs + globalStats.reviewHrs) / (globalStats.totalAct || 1)) * 100;
    const avgCycleTime = globalStats.ctCount > 0 ? (globalStats.totalCycleTime / globalStats.ctCount).toFixed(1) : 0;

    const getSevPct = (val) => globalStats.sev.totalItems > 0 ? ((val / globalStats.sev.totalItems) * 100).toFixed(1) : 0;

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
    </table>
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
        areaDevs[area].forEach(d => { devParticipation[d] = (devParticipation[d] || 0) + 1; });
        areaTesters[area].forEach(t => { testerParticipation[t] = (testerParticipation[t] || 0) + 1; });
        areaDbs[area].forEach(db => { dbParticipation[db] = (dbParticipation[db] || 0) + 1; });
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
        areaDevs[area].forEach(d => { if(devParticipation[d]) devCountCount += (1 / devParticipation[d]); });
        let testerCountCount = 0;
        areaTesters[area].forEach(t => { if(testerParticipation[t]) testerCountCount += (1 / testerParticipation[t]); });
        let dbCountCount = 0;
        areaDbs[area].forEach(db => { if(dbParticipation[db]) dbCountCount += (1 / dbParticipation[db]); });

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
        const totalAllBugs = stats.bugsCount + stats.totalUatBugs;
        const dreValueNum = totalAllBugs > 0 ? (stats.bugsCount / totalAllBugs) * 100 : 100;
        const dreValue = dreValueNum.toFixed(1);
        const dreColor = dreValueNum >= 85 ? '#2e7d32' : '#d32f2f';
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
            const totalAllBugsLocal = s.bugsCount + (s.totalUatBugs || 0);
            const calculatedDre = totalAllBugsLocal > 0 ? (s.bugsCount / totalAllBugsLocal) * 100 : 100;
            const bugSeverityRatio = s.bugsCount > 0 ? (highSevBugs / s.bugsCount) * 100 : 0;
            const reviewSeverityRatio = s.reviewCount > 0 ? (highSevReviews / s.reviewCount) * 100 : 0;
            const uatLeakageRatio = totalAllBugsLocal > 0 ? ((s.totalUatBugs || 0) / totalAllBugsLocal) * 100 : 0;

            if (reviewCatchRate > 40) insights.push(`<li><b>Shift-Left Strategy Efficiency:</b> Peer Reviews intercepted <span style="color:#27ae60; font-weight:bold;">${reviewCatchRate.toFixed(1)}%</span> of total issues before reaching the formal testing execution cycle.</li>`);
            else if (reviewCatchRate > 15) insights.push(`<li><b>Shift-Left Progression:</b> Peer Reviews caught <span style="color:#3498db; font-weight:bold;">${reviewCatchRate.toFixed(1)}%</span> of defects. Room to strengthen code reviews.</li>`);
            else insights.push(`<li><b>Shift-Left Risk Warning:</b> Peer Reviews intercepted only <span style="color:#e74c3c; font-weight:bold;">${reviewCatchRate.toFixed(1)}%</span> of anomalies. Reinforce code-review policies.</li>`);

            if (effortVariance > 15 && combinedReworkRatio > 15) insights.push(`<li><b>⚠️ Rework-Driven Slippage:</b> Effort Variance (${effortVariance.toFixed(1)}%) and Rework Ratio (${combinedReworkRatio.toFixed(1)}%) both high. Slippage driven by bug-fixing.</li>`);
            else if (effortVariance > 15 && combinedReworkRatio <= 15) insights.push(`<li><b>🔍 Estimation Model Flaw:</b> Effort Variance high (${effortVariance.toFixed(1)}%) but rework healthy (${combinedReworkRatio.toFixed(1)}%). Baseline estimation models need review.</li>`);
            else if (effortVariance <= 0 && combinedReworkRatio > 20) insights.push(`<li><b>⚡ Aggressive Coding:</b> Delivered under budget (${effortVariance.toFixed(1)}%) yet rework density critical (${combinedReworkRatio.toFixed(1)}%). Technical debt risk.</li>`);

            if (calculatedDre < 85 && (s.totalUatBugs || 0) > 0) insights.push(`<li><b>🛑 Degraded Quality Shield:</b> DRE at ${calculatedDre.toFixed(1)}% due to ${s.totalUatBugs} UAT leakages.</li>`);
            else if (calculatedDre >= 85 && s.bugsCount > 0) insights.push(`<li><b>🎯 Elite Verification Integrity:</b> Outstanding DRE at ${calculatedDre.toFixed(1)}%.</li>`);

            if (s.bugsCount > 0) {
                if (bugSeverityRatio > 30) insights.push(`<li><b>Defect Severity Alert:</b> High-severity bugs constitute ${bugSeverityRatio.toFixed(1)}% of test cycle bugs.</li>`);
                else insights.push(`<li><b>Defect Profile Stability:</b> High-severity leaks low (${bugSeverityRatio.toFixed(1)}%).</li>`);
            }

            if (avgTimePerBug > 4 && s.bugsCount > 0) insights.push(`<li><b>Rework Friction:</b> Mean Time to Resolve bug is ${avgTimePerBug.toFixed(1)}h/bug.</li>`);
            if (reviewSeverityRatio > 40 && bugSeverityRatio < 15 && s.reviewCount > 0) insights.push(`<li><b>🛡️ High-Fidelity Reviews:</b> Peer reviews filter architectural flaws early.</li>`);
            if (s.reviewCount > 10 && highSevReviews === 0 && bugSeverityRatio > 40) insights.push(`<li><b>🚨 Superficial Peer-Review:</b> High volume of reviews (${s.reviewCount}) detected zero high-severity issues.</li>`);
            if (uatLeakageRatio > 25 && s.bugsCount > 0) insights.push(`<li><b>💥 Severe Quality Gate Escape:</b> UAT leakages reached ${uatLeakageRatio.toFixed(1)}%.</li>`);
            if (dbCountCount > 0 && avgCycleTime > 6 && bugSeverityRatio > 35) insights.push(`<li><b>🗄️ Database Coupling Friction:</b> DB changes correlate with extended cycle time and high bug severity.</li>`);
            if (devCountCount > 0 && testerCountCount > 0) {
                const devToTesterRatio = devCountCount / testerCountCount;
                if (devToTesterRatio > 3 && s.totalUatBugs > 2) insights.push(`<li><b>⚖️ Resource Skew:</b> Dev-to-Tester ratio ${devToTesterRatio.toFixed(1)}:1 with UAT leakages.</li>`);
            }
            if (insights.length === 0) return "<li><b>✅ Balanced Quality Lifecycle:</b> No critical anomalies.</li>";
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
                <div style="background:#fafafa; border-radius:10px; padding:20px; border-left:4px solid ${varianceColor};">
                    <div style="font-size:0.85em; color:#747d8c; text-transform:uppercase; font-weight:600;">Effort Variance</div>
                    <div style="font-size:1.8em; font-weight:700; color:${varianceColor};">${effortVariance.toFixed(1)}%</div>
                    <div style="font-size:0.8em; color:#57606f;">Est: <b>${stats.totalEst.toFixed(1)}h</b> | Act: <b>${stats.totalAct.toFixed(1)}h</b></div>
                </div>
                <div style="background:#fafafa; border-radius:10px; padding:20px; border-left:4px solid ${reworkColor};">
                    <div style="font-size:0.85em; color:#747d8c; text-transform:uppercase; font-weight:600;">Rework & Review Ratio</div>
                    <div style="font-size:1.8em; font-weight:700; color:${reworkColor};">${combinedReworkRatio.toFixed(1)}%</div>
                    <div style="font-size:0.8em; color:#57606f;">Bugs: <b>${stats.reworkTime.toFixed(1)}h</b> | Revs: <b>${stats.reviewTime.toFixed(1)}h</b></div>
                </div>
                <div style="background:#fafafa; border-radius:10px; padding:20px; border-left:4px solid ${dreColor};">
                    <div style="font-size:0.85em; color:#747d8c; text-transform:uppercase; font-weight:600;">DRE</div>
                    <div style="font-size:1.8em; font-weight:700; color:${dreColor};">${dreValue}%</div>
                    <div style="font-size:0.8em; color:#57606f;">UAT: <b>${stats.totalUatBugs}</b> / Iteration: <b>${stats.bugsCount}</b></div>
                </div>
                <div style="background:#fafafa; border-radius:10px; padding:20px; border-left:4px solid #8e44ad;">
                    <div style="font-size:0.85em; color:#747d8c; text-transform:uppercase; font-weight:600;">Avg Cycle Time</div>
                    <div style="font-size:1.8em; font-weight:700; color:#8e44ad;">${avgCycleTime} Days</div>
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

            <div style="margin-top:25px; background:#f9f9fb; border-radius:8px; padding:20px; border:1px solid #eccc68;">
                <h4 style="margin:0 0 12px 0; color:#ffa502; font-size:1.05em; font-weight:700;">🧠 Defect Analyses</h4>
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

    processedStories.forEach(us => {
        const area = us.businessArea || 'General';
        if (!businessAreas[area]) businessAreas[area] = {};
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
            if (isReport) peopleMap[person].reportStories.add(us.id);
        });

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
        const devs = allPeople.filter(p => p.devHours > 0);
        const testers = allPeople.filter(p => p.testHours > 0);
        const dbs = allPeople.filter(p => p.dbHours > 0);

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

        html += renderRoleTable('💻 Development Team', devs, '#2c3e50');
        html += renderRoleTable('🧪 Testing Team', testers, '#27ae60');
        html += renderRoleTable('🗄️ Database Team', dbs, '#8e44ad');
        html += `</div>`;
    }
    html += `</div>`;
    container.innerHTML = html;
}

function renderNotTestedView() {
    const container = document.getElementById('not-tested-view');
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
            const devTasksSorted = us.tasks.filter(t => t.Activity !== 'Testing')
                .sort((a, b) => new Date(a['Activated Date'] || 0) - new Date(b['Activated Date'] || 0));
            const testingTasksSorted = us.tasks.filter(t => t.Activity === 'Testing')
                .sort((a, b) => parseInt(a.id || 0) - parseInt(b.id || 0));
            const sortedTasks = [...devTasksSorted, ...testingTasksSorted];

            html += `
                <div class="card" style="margin-bottom: 30px; border-left: 5px solid #e67e22; overflow-x: auto;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <h4>ID: ${us.id} - ${us.title}</h4>
                        <span style="background: #eee; padding: 2px 8px; border-radius: 4px; font-size: 0.8em;">Status: <b>${us.status}</b></span>
                    </div>
                    <p><b>Dev Lead:</b> ${us.devLead} | <b>Tester Lead:</b> ${us.testerLead}</p>
                    
                    <table style="width:100%; border-collapse:collapse; margin-bottom:15px;">
                        <thead><tr><th>Type</th><th>Est. (H)</th><th>Actual (H)</th><th>Effort Variance</th></tr></thead>
                        <tbody>
                            <tr><td>Dev</td><td>${us.devEffort.orig}</td><td>${us.devEffort.actual}</td><td class="${us.devEffort.dev < 1 ? 'alert-red' : ''}">${us.devEffort.dev.toFixed(2)}</td></tr>
                            <tr><td>Test</td><td>${us.testEffort.orig}</td><td>${us.testEffort.actual}</td><td class="${us.testEffort.dev < 1 ? 'alert-red' : ''}">${us.testEffort.dev.toFixed(2)}</td></tr>
                        </tbody>
                    </table>

                    <h5 style="margin: 10px 0;">Tasks Timeline:</h5>
                    <table style="font-size: 0.85em; width: 100%;">
                        <thead><tr style="background:#eee;"><th>ID</th><th>Task Name</th><th>Activity</th><th>Est</th><th>Exp. Start</th><th>Exp. End</th><th>Act. Start</th><th>TS Total</th><th>Delay</th> </tr></thead>
                        <tbody>
                            ${sortedTasks.map(t => {
                                const tsTotal = (parseFloat(t['TimeSheet_DevActualTime']) || 0) + (parseFloat(t['TimeSheet_TestingActualTime']) || 0);
                                const est = parseFloat(t['Original Estimation']) || 0;
                                const delay = calculateHourDiff(t.expectedStart, t['Activated Date']);
                                return `
                                <tr>
                                    <td>${t['ID']}</td>
                                    <td style="max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${t['Title']}">${t['Title'] || 'N/A'}</td>
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

// ==================== NEW: Historical Analytics Functions ====================

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
            updateIterationDropdown();
            renderAzureConfigsTable();
        }
    } catch (error) {
        console.error("Error loading configs from cloud:", error);
    }
}

function updateIterationDropdown() {
    const select = document.getElementById('azureIterationSelect');
    if (!select) return;
    const savedQueries = azureConfigs || [];
    select.innerHTML = '<option value="">-- Select Iteration --</option>';
    savedQueries.forEach(config => {
        const option = document.createElement('option');
        option.value = JSON.stringify({ org: config.org || "", project: config.project || "", id: config.id || "" });
        option.textContent = config.name || `${config.project} - Query`;
        select.appendChild(option);
    });
}

async function fetchFromAzure() {
    const select = document.getElementById('azureIterationSelect');
    if (!select || select.value === "") return alert("Please select a query");
    const config = JSON.parse(select.value);
    const pat = localStorage.getItem('azure_pat');
    const statusDiv = document.getElementById('sync-status');
    if (!pat) return alert("Please enter Azure PAT in login screen");
    statusDiv.style.display = 'block';
    statusDiv.innerText = "⏳ Connecting to Azure DevOps...";
    try {
        const authHeader = { 'Authorization': 'Basic ' + btoa(':' + pat) };
        const wiqlUrl = `https://dev.azure.com/${config.org}/${config.project}/_apis/wit/wiql/${config.id}?api-version=6.0`;
        const wiqlRes = await fetch(wiqlUrl, { headers: authHeader });
        if (!wiqlRes.ok) throw new Error(`WIQL error: ${wiqlRes.status}`);
        const wiqlData = await wiqlRes.json();
        let workItemIds = [];
        if (wiqlData.workItemRelations) workItemIds = wiqlData.workItemRelations.map(rel => rel.target ? rel.target.id : null).filter(id => id !== null);
        else workItemIds = wiqlData.workItems.map(wi => wi.id);
        if (workItemIds.length === 0) { statusDiv.innerText = "⚠️ No results from query."; return; }
        statusDiv.innerText = `⏳ Found ${workItemIds.length} items, fetching details...`;
        let allItemsDetails = [];
        for (let i = 0; i < workItemIds.length; i += 200) {
            const chunk = workItemIds.slice(i, i + 200).join(',');
            const detailsUrl = `https://dev.azure.com/${config.org}/${config.project}/_apis/wit/workitems?ids=${chunk}&$expand=all&api-version=6.0`;
            const detailsRes = await fetch(detailsUrl, { headers: authHeader });
            const detailsData = await detailsRes.json();
            allItemsDetails = allItemsDetails.concat(detailsData.value);
            statusDiv.innerText = `⏳ Loading: ${allItemsDetails.length} / ${workItemIds.length}`;
        }
        rawData = allItemsDetails.map(item => mapAzureFields(item));
        processData(); 
        statusDiv.innerText = "✅ Data fetched successfully";
        showView('iteration-view');
    } catch (error) {
        console.error("Azure Integration Error:", error);
        statusDiv.innerText = "❌ Fetch failed: " + error.message;
    }
}

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
        "BugType": f["NT.BugType"] || ""
    };
}

async function fetchIterationSummary(config) {
    const pat = localStorage.getItem('azure_pat');
    if (!pat) throw new Error("Azure PAT missing");
    const authHeader = { 'Authorization': 'Basic ' + btoa(':' + pat) };
    const wiqlUrl = `https://dev.azure.com/${config.org}/${config.project}/_apis/wit/wiql/${config.id}?api-version=6.0`;
    const wiqlRes = await fetch(wiqlUrl, { headers: authHeader });
    if (!wiqlRes.ok) throw new Error(`WIQL failed: ${wiqlRes.status}`);
    const wiqlData = await wiqlRes.json();
    let workItemIds = [];
    if (wiqlData.workItemRelations) workItemIds = wiqlData.workItemRelations.map(rel => rel.target ? rel.target.id : null).filter(id => id !== null);
    else workItemIds = wiqlData.workItems.map(wi => wi.id);
    if (workItemIds.length === 0) return null;
    let allItems = [];
    for (let i = 0; i < workItemIds.length; i += 200) {
        const chunk = workItemIds.slice(i, i + 200).join(',');
        const detailsUrl = `https://dev.azure.com/${config.org}/${config.project}/_apis/wit/workitems?ids=${chunk}&$expand=all&api-version=6.0`;
        const detailsRes = await fetch(detailsUrl, { headers: authHeader });
        const detailsData = await detailsRes.json();
        allItems.push(...detailsData.value);
    }
    const rawIterationData = allItems.map(item => mapAzureFields(item));
    const stories = buildStoriesFromRawDataForHistory(rawIterationData);
    calculateMetricsForStoriesForHistory(stories);
    let totalStories = stories.length;
    let totalEst = 0, totalAct = 0;
    let totalCycleTime = 0, cycleCount = 0;
    let totalInternalBugs = 0, totalUatBugs = 0;
    let closedCount = 0;
    stories.forEach(us => {
        const est = us.devEffort.orig + us.testEffort.orig + (us.dbEffort?.orig || 0);
        const act = us.devEffort.actual + us.testEffort.actual + (us.dbEffort?.actual || 0) + us.rework.actualTime + (us.reviewStats.devActual + us.reviewStats.testActual);
        totalEst += est;
        totalAct += act;
        if (us.cycleTime > 0) { totalCycleTime += us.cycleTime; cycleCount++; }
        totalInternalBugs += us.rework.count;
        totalUatBugs += us.rework.uatBugsCount;
        if (us.status === 'Closed' || us.status === 'Tested' || us.status === 'Resolved' || us.status === 'To Be Reviewed') closedCount++;
    });
    const avgCycleTime = cycleCount ? (totalCycleTime / cycleCount).toFixed(1) : 0;
    const effortVariance = totalEst ? ((totalAct - totalEst) / totalEst) * 100 : 0;
    const totalBugs = totalInternalBugs + totalUatBugs;
    const dre = totalBugs ? (totalInternalBugs / totalBugs) * 100 : 100;
    return {
        iterationName: config.name,
        totalStories: totalStories,
        completedStories: closedCount,
        avgCycleTime: parseFloat(avgCycleTime),
        effortVariance: parseFloat(effortVariance.toFixed(1)),
        dre: parseFloat(dre.toFixed(1)),
        internalBugs: totalInternalBugs,
        uatBugs: totalUatBugs
    };
}

async function syncAllIterationsData() {
    if (!azureConfigs || azureConfigs.length === 0) {
        alert("No Azure iterations configured. Please add queries in Azure Config first.");
        return;
    }
    const statusDiv = document.getElementById('sync-status');
    statusDiv.style.display = 'block';
    const summaries = [];
    for (let i = 0; i < azureConfigs.length; i++) {
        const config = azureConfigs[i];
        statusDiv.innerText = `⏳ Fetching ${config.name} (${i+1}/${azureConfigs.length})...`;
        try {
            const summary = await fetchIterationSummary(config);
            if (summary) summaries.push(summary);
            await new Promise(r => setTimeout(r, 500));
        } catch (err) {
            console.error(`Failed for ${config.name}:`, err);
            statusDiv.innerText = `⚠️ Error on ${config.name}: ${err.message}`;
            await new Promise(r => setTimeout(r, 1000));
        }
    }
    if (summaries.length) {
        await uploadHistoricalSummary(summaries);
        localStorage.setItem('historical_summaries', JSON.stringify(summaries));
        statusDiv.innerText = `✅ Synced ${summaries.length} iterations to historical data.`;
    } else {
        statusDiv.innerText = "❌ No summary data collected.";
    }
    setTimeout(() => statusDiv.style.display = 'none', 3000);
}

async function uploadHistoricalSummary(summaries) {
    if (!githubToken) return;
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(summaries, null, 2))));
    let sha = "";
    try {
        const res = await fetch(`https://api.github.com/repos/${GH_CONFIG.owner}/${GH_CONFIG.repo}/contents/historical_summary.json`, {
            headers: { 'Authorization': `token ${githubToken}` }
        });
        if (res.ok) {
            const data = await res.json();
            sha = data.sha;
        }
    } catch (e) { /* file does not exist, sha remains empty */ }
    await fetch(`https://api.github.com/repos/${GH_CONFIG.owner}/${GH_CONFIG.repo}/contents/historical_summary.json`, {
        method: 'PUT',
        headers: { 'Authorization': `token ${githubToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: "Update historical iteration summaries", content: content, sha: sha, branch: GH_CONFIG.branch })
    });
}

async function loadHistoricalSummary() {
    if (!githubToken) return null;
    try {
        const res = await fetch(`https://api.github.com/repos/${GH_CONFIG.owner}/${GH_CONFIG.repo}/contents/historical_summary.json`, {
            headers: { 'Authorization': `token ${githubToken}`, 'Accept': 'application/vnd.github.v3.raw' }
        });
        if (res.ok) {
            const content = await res.text();
            return JSON.parse(content);
        } else if (res.status === 404) {
            console.log("No historical summary file yet.");
        }
    } catch (e) {
        console.warn("Error loading historical summary:", e);
    }
    const local = localStorage.getItem('historical_summaries');
    return local ? JSON.parse(local) : [];
}

async function renderHistoricalAnalyticsView() {
    const container = document.getElementById('historical-analytics-view');
    if (!container) {
        console.error("Historical analytics view container not found");
        return;
    }

    let historicalData = await loadHistoricalSummary();
    if (!historicalData || historicalData.length === 0) {
        container.innerHTML = `<div class="card"><p>No historical data available. Please click "Sync All Iterations Data" first.</p></div>`;
        return;
    }

    // Ensure canvas elements exist (create them if missing)
    let cycleCanvas = document.getElementById('cycleTimeChart');
    let storiesCanvas = document.getElementById('storiesBugsChart');
    
    if (!cycleCanvas) {
        const chartDiv = document.createElement('div');
        chartDiv.style.flex = "1";
        chartDiv.style.minWidth = "300px";
        chartDiv.style.background = "white";
        chartDiv.style.borderRadius = "12px";
        chartDiv.style.padding = "15px";
        chartDiv.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
        cycleCanvas = document.createElement('canvas');
        cycleCanvas.id = 'cycleTimeChart';
        cycleCanvas.width = 400;
        cycleCanvas.height = 300;
        chartDiv.appendChild(cycleCanvas);
        container.prepend(chartDiv);
    }
    
    if (!storiesCanvas) {
        const chartDiv = document.createElement('div');
        chartDiv.style.flex = "1";
        chartDiv.style.minWidth = "300px";
        chartDiv.style.background = "white";
        chartDiv.style.borderRadius = "12px";
        chartDiv.style.padding = "15px";
        chartDiv.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
        storiesCanvas = document.createElement('canvas');
        storiesCanvas.id = 'storiesBugsChart';
        storiesCanvas.width = 400;
        storiesCanvas.height = 300;
        chartDiv.appendChild(storiesCanvas);
        container.appendChild(chartDiv);
    }

    historicalData.sort((a,b) => a.iterationName.localeCompare(b.iterationName));
    const labels = historicalData.map(d => d.iterationName);
    const cycleTimes = historicalData.map(d => d.avgCycleTime);
    const storiesCount = historicalData.map(d => d.completedStories);
    const bugsCount = historicalData.map(d => d.internalBugs + d.uatBugs);
    
    const cycleCtx = cycleCanvas.getContext('2d');
    const storiesCtx = storiesCanvas.getContext('2d');
    
    // Destroy existing charts only if they are Chart instances
    if (window.cycleTimeChart && typeof window.cycleTimeChart.destroy === 'function') {
        window.cycleTimeChart.destroy();
    }
    if (window.storiesBugsChart && typeof window.storiesBugsChart.destroy === 'function') {
        window.storiesBugsChart.destroy();
    }
    
    window.cycleTimeChart = new Chart(cycleCtx, {
        type: 'line',
        data: { labels, datasets: [{ label: 'Avg Cycle Time (days)', data: cycleTimes, borderColor: '#3498db', backgroundColor: 'rgba(52,152,219,0.1)', tension: 0.3, fill: true }] },
        options: { responsive: true, maintainAspectRatio: true, plugins: { tooltip: { callbacks: { label: (ctx) => `${ctx.raw} days` } } } }
    });
    
    window.storiesBugsChart = new Chart(storiesCtx, {
        type: 'bar',
        data: { labels, datasets: [
            { label: 'Completed Stories', data: storiesCount, backgroundColor: '#2ecc71' },
            { label: 'Total Bugs (Internal+UAT)', data: bugsCount, backgroundColor: '#e74c3c' }
        ] },
        options: { responsive: true, maintainAspectRatio: true, scales: { y: { beginAtZero: true, title: { display: true, text: 'Count' } } } }
    });
    
    let tableHtml = `<table style="width:100%; border-collapse:collapse; background:white; border-radius:8px; overflow:hidden; box-shadow:0 2px 5px rgba(0,0,0,0.1);">
        <thead><tr style="background:#2c3e50; color:white;">
            <th style="padding:12px;">Iteration</th><th>Stories (Total)</th><th>Completed</th><th>Avg Cycle (days)</th><th>Effort Variance %</th><th>DRE %</th><th>Internal Bugs</th><th>UAT Bugs</th>
        </tr></thead><tbody>`;
    historicalData.forEach(d => {
        tableHtml += `<tr style="border-bottom:1px solid #eee;">
            <td style="padding:10px;">${d.iterationName}</td>
            <td style="text-align:center;">${d.totalStories}</td>
            <td style="text-align:center;">${d.completedStories}</td>
            <td style="text-align:center;">${d.avgCycleTime}</td>
            <td style="text-align:center; color:${d.effortVariance > 15 ? '#e74c3c' : '#27ae60'};">${d.effortVariance}%</td>
            <td style="text-align:center; color:${d.dre < 85 ? '#e67e22' : '#27ae60'};">${d.dre}%</td>
            <td style="text-align:center;">${d.internalBugs}</td>
            <td style="text-align:center;">${d.uatBugs}</td>
        </tr>`;
    });
    tableHtml += `</tbody></table>`;
    
    let existingTable = document.getElementById('historicalSummaryTable');
    if (!existingTable) {
        existingTable = document.createElement('div');
        existingTable.id = 'historicalSummaryTable';
        container.appendChild(existingTable);
    }
    existingTable.innerHTML = tableHtml;
}

// Helper for building stories from raw data without side effects (for historical sync)
function buildStoriesFromRawDataForHistory(data) {
    const stories = [];
    let currentStory = null;
    data.forEach(row => {
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
            stories.push(currentStory);
        } else if (currentStory) {
            if (type === 'Task') currentStory.tasks.push(row);
            if (type === 'Bug') currentStory.bugs.push(row);
            if (type === 'Review') currentStory.reviews.push(row);
        }
    });
    return stories;
}

// Helper for calculating metrics without side effects (for historical sync)
function calculateMetricsForStoriesForHistory(stories) {
    stories.forEach(us => {
        let devOrig = 0, devActual = 0, testOrig = 0, testActual = 0;
        let dbOrig = 0, dbActual = 0, dbNames = new Set();
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
        us.dbEffort = { orig: dbOrig, actual: dbActual, dev: dbOrig / (dbActual || 1), names: Array.from(dbNames).join(', ') || 'N/A' };
        us.devEffort = { orig: devOrig, actual: devActual, dev: devOrig / (devActual || 1) };
        us.testEffort = { orig: testOrig, actual: testActual, dev: testOrig / (testActual || 1) };

        let bugOrig = 0, bugActualTotal = 0, bugsNoTimesheet = 0;
        us.severityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
        us.rework = {
            generic: { count: 0, actualTime: 0, severity: { critical: 0, high: 0, medium: 0, low: 0 } },
            specific: { count: 0, actualTime: 0, severity: { critical: 0, high: 0, medium: 0, low: 0 } },
            severity: { critical: 0, high: 0, medium: 0, low: 0 }, 
            timeEstimation: 0,
            actualTime: 0,
            count: 0,
            uatBugsCount: 0,
            iterationBugsCount: 0
        };
        us.bugs.forEach(b => {
            const isGeneric = (b['GenericBug'] || "").trim().toLowerCase() === 'yes';
            const bDevAct = parseFloat(b['TimeSheet_DevActualTime']) || 0;
            const bEst = parseFloat(b['Original Estimation']) || 0;
            const sev = b['Severity'] || "";
            const bugType = (b['BugType'] || "").trim().toUpperCase();
            if (bugType === 'UAT') us.rework.uatBugsCount++;
            else us.rework.iterationBugsCount++;
            bugOrig += bEst;
            bugActualTotal += bDevAct;
            if (bDevAct === 0) bugsNoTimesheet++;
            const target = isGeneric ? us.rework.generic : us.rework.specific;
            target.count++;
            target.actualTime += bDevAct;
            if (sev.includes("1 - Critical")) { 
                target.severity.critical++; us.rework.severity.critical++; us.severityCounts.critical++;
            } else if (sev.includes("2 - High")) { 
                target.severity.high++; us.rework.severity.high++; us.severityCounts.high++;
            } else if (sev.includes("3 - Medium")) { 
                target.severity.medium++; us.rework.severity.medium++; us.severityCounts.medium++;
            } else if (sev.includes("4 - Low")) { 
                target.severity.low++; us.rework.severity.low++; us.severityCounts.low++;
            }
        });
        us.rework.timeEstimation = bugOrig;
        us.rework.actualTime = bugActualTotal;
        us.rework.count = us.bugs.length;
        us.rework.missingTimesheet = bugsNoTimesheet;
        us.rework.deviation = bugOrig / (bugActualTotal || 1);
        us.rework.percentage = (bugActualTotal / (us.devEffort.actual || 1)) * 100;
        
        us.reviewStats = {
            estimation: 0, devActual: 0, testActual: 0, totalActual: 0,
            devCount: 0, testCount: 0, count: us.reviews ? us.reviews.length : 0,
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

function renderAzureConfigsTable() {
    const tbody = document.getElementById('azureConfigsTableBody');
    if (!tbody) return;
    const savedQueries = azureConfigs || [];
    if (savedQueries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No queries found in cloud configuration.</td></tr>';
        return;
    }
    tbody.innerHTML = savedQueries.map((config, index) => `
        <tr>
            <td>${config.name || 'N/A'}</td>
            <td>${config.org || 'N/A'} / ${config.project || 'N/A'}</td>
            <td>${config.id || 'N/A'}</td>
            <td><button onclick="deleteAzureConfig(${index})" style="background:#e74c3c; padding:5px 10px; color:white; border:none; border-radius:3px; cursor:pointer;">Delete</button></td>
        </tr>
    `).join('');
}

async function addAzureConfig() {
    const config = {
        id: document.getElementById('azQueryId').value,
        name: document.getElementById('azQueryName').value,
        org: document.getElementById('azOrg').value,
        project: document.getElementById('azProject').value
    };
    if (!config.id || !config.name) return alert("Please fill all fields");
    try {
        await loadConfigsFromCloud();
        const updatedConfigs = [...azureConfigs, config];
        const updateResponse = await fetch(`https://api.github.com/repos/${GH_CONFIG.owner}/${GH_CONFIG.repo}/contents/azure_configs.json`, {
            method: 'PUT',
            headers: { 'Authorization': `token ${githubToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: "Add Azure Config", content: btoa(unescape(encodeURIComponent(JSON.stringify(updatedConfigs, null, 2)))), sha: azureConfigsSha })
        });
        if (updateResponse.ok) {
            alert("Saved successfully!");
            await loadConfigsFromCloud();
        } else throw new Error("Failed to update GitHub");
    } catch (error) {
        alert("Error saving: " + error.message);
    }
}

async function deleteAzureConfig(index) {
    if (!confirm("Delete this configuration from cloud?")) return;
    try {
        const updatedConfigs = [...azureConfigs];
        updatedConfigs.splice(index, 1);
        const updateResponse = await fetch(`https://api.github.com/repos/${GH_CONFIG.owner}/${GH_CONFIG.repo}/contents/azure_configs.json`, {
            method: 'PUT',
            headers: { 'Authorization': `token ${githubToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: "Delete Azure Config", content: btoa(unescape(encodeURIComponent(JSON.stringify(updatedConfigs, null, 2)))), sha: azureConfigsSha })
        });
        if (updateResponse.ok) {
            alert("Deleted successfully");
            await loadConfigsFromCloud();
        } else throw new Error("Failed to update GitHub");
    } catch (error) {
        alert("Error deleting: " + error.message);
    }
}

// ==================== View Switching ====================
function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
    const target = document.getElementById(viewId);
    if (target) target.style.display = 'block';
    if (processedStories.length === 0 && viewId !== 'historical-analytics-view') return;
    if (viewId === 'iteration-view') renderIterationView();
    if (viewId === 'business-view') renderBusinessView();
    if (viewId === 'team-view') renderTeamView();
    if (viewId === 'people-view') renderPeopleView();
    if (viewId === 'not-tested-view') renderNotTestedView();
    if (viewId === 'users-view') renderUsersTable();
    if (viewId === 'historical-analytics-view') renderHistoricalAnalyticsView();
}

// ==================== Initialization ====================
window.onload = async () => {
    const savedUser = localStorage.getItem('saved_user');
    const savedPass = localStorage.getItem('saved_pass');
    const savedGhToken = localStorage.getItem('gh_token');
    const savedAzurePat = localStorage.getItem('azure_pat');
    const savedRole = localStorage.getItem('app_role');
    if (savedUser) document.getElementById('loginUser').value = savedUser;
    if (savedPass) document.getElementById('loginPass').value = savedPass;
    if (savedGhToken) document.getElementById('ghTokenInput').value = savedGhToken;
    if (savedAzurePat) document.getElementById('azurePatInput').value = savedAzurePat;
    if (savedGhToken && savedRole && savedUser) {
        githubToken = savedGhToken;
        document.getElementById('login-overlay').style.display = 'none';
        if (document.getElementById('main-nav')) document.getElementById('main-nav').style.display = 'flex';
        currentUser = { name: savedUser, role: savedRole };
        setupPermissions();
        await fetchDataFromGitHub();
    }
    if (typeof renderAzureConfigsTable === 'function') renderAzureConfigsTable();
};
