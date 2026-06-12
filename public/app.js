// --- CENTRALIZED ARCHITECTURE APPLICATION STATE ---
let currentSession = {
    user: null, 
    questions: [],
    currentIndex: 0,
    score: 0,
    incorrectItems: [],
    selectedAnswer: null,
    isSelectedAnswerCorrect: false, 
    timerInterval: null,
    timeLeft: 3600
};

let authIsRegistrationMode = true; 

// --- INTERACTIVE MATRIX DOCUMENT ENGINE MATCHES ---
const stages = {
    landing: document.getElementById('landing-stage'),
    auth: document.getElementById('auth-stage'),
    dashboard: document.getElementById('dashboard-stage'),
    exam: document.getElementById('exam-stage'),
    results: document.getElementById('results-stage')
};

// --- SINGLE PAGE STAGE ROUTER VIEWPORTS ---
function navigateToStage(activeStageKey) {
    Object.keys(stages).forEach(key => {
        if (key === activeStageKey) {
            stages[key].classList.remove('hidden');
        } else {
            stages[key].classList.add('hidden');
        }
    });
}

// --- INITIAL CONTEXT LIFECYCLE EVALUATOR ---
window.addEventListener('DOMContentLoaded', () => {
    const cachedUser = localStorage.getItem('lto_profile_cache');
    if (cachedUser) {
        currentSession.user = JSON.parse(cachedUser);
        loadDashboardPortfolio();
    } else {
        navigateToStage('landing');
    }
});

// --- CORE ACTION WIRE EVENT BINDINGS ---
document.getElementById('to-login-btn').addEventListener('click', () => {
    authIsRegistrationMode = true;
    updateAuthInterfaceDOM();
    navigateToStage('auth');
});

document.getElementById('auth-toggle-mode').addEventListener('click', () => {
    authIsRegistrationMode = !authIsRegistrationMode;
    updateAuthInterfaceDOM();
});

document.getElementById('auth-submit-btn').addEventListener('click', handleAuthenticationRequest);
document.getElementById('logout-action-btn').addEventListener('click', processSignoutClearance);
document.getElementById('start-btn').addEventListener('click', initializeSession);
document.getElementById('next-btn').addEventListener('click', advanceQuestion);
document.getElementById('restart-btn').addEventListener('click', () => {
    loadDashboardPortfolio();
});

// --- TOGGLE INTERLOCK FOR DRIVER RESTRICTIONS ---
document.getElementById('learning-status').addEventListener('change', (e) => {
    const topicMenu = document.getElementById('exam-topic');
    if (e.target.value === 'driver') {
        topicMenu.value = 'all';
        topicMenu.disabled = true;
        topicMenu.style.opacity = '0.5';
    } else {
        topicMenu.disabled = false;
        topicMenu.style.opacity = '1';
    }
});

// --- UI AUTH TEXT DRIVER LAYOUTS ---
function updateAuthInterfaceDOM() {
    const ageBlock = document.getElementById('age-input-block');
    const title = document.querySelector('#auth-stage h2');
    const toggleBtn = document.getElementById('auth-toggle-mode');
    
    if (authIsRegistrationMode) {
        title.innerText = "Register New Driver Profile";
        ageBlock.classList.remove('hidden');
        toggleBtn.innerText = "Switch to Returning Profile Login";
    } else {
        title.innerText = "Returning Driver Login Portal";
        ageBlock.classList.add('hidden');
        toggleBtn.innerText = "Switch to Create New Account Registration";
    }
}

// --- SERVER-SIDE IDENTITY ENGINE COUPLING ---
async function handleAuthenticationRequest() {
    const nameInput = document.getElementById('username').value.trim();
    const ageInput = parseInt(document.getElementById('userage').value);

    if (!nameInput) {
        alert('Identification parameters missing.');
        return;
    }

    try {
        if (authIsRegistrationMode) {
            if (!ageInput) { alert('Age registration parameters required.'); return; }
            
            const response = await fetch('/api/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: nameInput, age: ageInput, learning_status: document.getElementById('learning-status').value })
            });
            currentSession.user = await response.json();
        } else {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: nameInput })
            });

            if (!response.ok) {
                alert('Profile match unverified. Check name string spelling or register account.');
                return;
            }
            currentSession.user = await response.json();
        }

        localStorage.setItem('lto_profile_cache', JSON.stringify(currentSession.user));
        loadDashboardPortfolio();

    } catch (err) {
        console.error("Authentication handshake crashed:", err);
        alert('Server linkage interrupted.');
    }
}

// --- LOADING ACTIONS AND PORTFOLIO HISTORY RECORDS ---
async function loadDashboardPortfolio() {
    document.getElementById('dashboard-welcome').innerText = `Welcome back, ${currentSession.user.name}!`;
    navigateToStage('dashboard');

    try {
        const historyResponse = await fetch(`/api/history/${currentSession.user.id}`);
        const dataHistory = await historyResponse.json();
        
        const historyContainer = document.getElementById('history-rows-container');
        historyContainer.innerHTML = '';

        if (dataHistory.length === 0) {
            historyContainer.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#999; font-size:0.85rem;">No historical exam completions cataloged yet.</td></tr>`;
            return;
        }

        dataHistory.forEach(record => {
            const row = document.createElement('tr');
            const percentGrade = Math.round((record.score / record.total_questions) * 100);
            const passed = percentGrade >= 80;
            
            row.innerHTML = `
                <td style="text-transform: capitalize; font-weight:500;">${record.exam_type}</td>
                <td><strong>${record.score}</strong> / ${record.total_questions}</td>
                <td style="color: ${passed ? 'var(--success)' : 'var(--error)'}; font-weight:700;">${percentGrade}% (${passed ? 'PASSED' : 'FAILED'})</td>
                <td style="font-size:0.8rem; color:#666;">${new Date(record.date_taken).toLocaleDateString()}</td>
            `;
            historyContainer.appendChild(row);
        });

    } catch (error) {
        console.error("Failed to recover historical telemetry logs:", error);
    }
}

function processSignoutClearance() {
    localStorage.removeItem('lto_profile_cache');
    currentSession.user = null;
    document.getElementById('username').value = '';
    document.getElementById('userage').value = '';
    navigateToStage('landing');
}

// --- UNIVERSAL EVALUATION SCHEMAS ---
function checkIsCorrect(optionText, index, q) {
    const rawCorrect = q.Correct_Answer !== undefined ? q.Correct_Answer : 
                       (q.correct_answer !== undefined ? q.correct_answer : q.answer);
    
    if (rawCorrect === undefined) return false;

    const cleanOption = String(optionText).toLowerCase().trim();
    const cleanCorrect = String(rawCorrect).toLowerCase().trim();

    if (cleanOption === cleanCorrect) return true;

    const pureOption = cleanOption.replace(/[^a-z0-9]/g, '');
    const pureCorrect = cleanCorrect.replace(/[^a-z0-9]/g, '');
    if (pureOption === pureCorrect && pureOption.length > 0) return true;

    const alphaKey = String.fromCharCode(65 + index).toLowerCase(); 
    if (pureCorrect === alphaKey) return true;

    return false;
}

// --- STAGE EXAM BOOT PROTOCOLS ---
async function initializeSession() {
    const learningStatus = document.getElementById('learning-status').value;
    const lang = document.getElementById('exam-lang').value;
    const topic = document.getElementById('exam-topic').value;

    try {
        const questionsResponse = await fetch(`/api/questions?lang=${lang}&type=${learningStatus}&topic=${encodeURIComponent(topic)}`);
        currentSession.questions = await questionsResponse.json();

        if (currentSession.questions.length === 0) {
            alert('The question pool for this configuration is empty or the database file is missing.');
            return;
        }

        currentSession.currentIndex = 0;
        currentSession.score = 0;
        currentSession.incorrectItems = [];

        if (topic !== 'all' && topic !== 'general' && topic !== 'renewal') {
            currentSession.timeLeft = 20 * 60; 
        } else if (learningStatus === 'driver') {
            currentSession.timeLeft = 30 * 60; 
        } else {
            currentSession.timeLeft = 60 * 60; 
        }

        navigateToStage('exam');
        startExamTimer();
        renderQuestion();

    } catch (error) {
        console.error('Session initialization failure:', error);
        alert('An error occurred while building the secure exam block workspace.');
    }
}

// --- RENDER QUESTIONS SYSTEMS ENGINE LOOP ---
function renderQuestion() {
    const nextBtn = document.getElementById('next-btn');
    nextBtn.classList.add('hidden');
    
    // DYNAMIC TEXT LABELLING: Turns to Submit Exam button if it is the absolute final item
    if (currentSession.currentIndex === currentSession.questions.length - 1) {
        nextBtn.innerText = "Submit Exam ➔";
    } else {
        nextBtn.innerText = "Proceed to Next Item ➔";
    }
    
    currentSession.selectedAnswer = null;
    currentSession.isSelectedAnswerCorrect = false;

    const q = currentSession.questions[currentSession.currentIndex];
    
    document.getElementById('question-counter').innerText = `Question ${currentSession.currentIndex + 1} of ${currentSession.questions.length}`;
    const progressPercent = (currentSession.currentIndex / currentSession.questions.length) * 100;
    document.getElementById('progress-bar').style.width = `${progressPercent}%`;

    document.getElementById('question-display').innerText = q.Question || q.question;

    const optionsContainer = document.getElementById('options-display');
    optionsContainer.innerHTML = '';

    const rawOptions = [
        q.Option_A || q.option_a,
        q.Option_B || q.option_b,
        q.Option_C || q.option_c,
        q.Option_D || q.option_d
    ];

    const validOptions = rawOptions.filter(opt => opt !== undefined && opt !== null && String(opt).trim() !== "");

    validOptions.forEach((option, index) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerText = option;
        
        btn.addEventListener('click', () => {
            if (currentSession.selectedAnswer !== null) return; 
            
            currentSession.selectedAnswer = option;
            const isCorrect = checkIsCorrect(option, index, q);
            currentSession.isSelectedAnswerCorrect = isCorrect;
            
            if (isCorrect) {
                btn.classList.add('correct');
            } else {
                btn.classList.add('wrong');
                
                const siblingButtons = optionsContainer.querySelectorAll('.option-btn');
                siblingButtons.forEach((sibling, sIndex) => {
                    if (checkIsCorrect(sibling.innerText, sIndex, q)) {
                        sibling.classList.add('correct');
                    }
                });
            }
            
            nextBtn.classList.remove('hidden');
        });

        optionsContainer.appendChild(btn);
    });
}

function advanceQuestion() {
    const q = currentSession.questions[currentSession.currentIndex];
    const safeTopic = q.Topic || q.topic || 'General Knowledge';

    if (currentSession.isSelectedAnswerCorrect) {
        currentSession.score++;
    } else {
        currentSession.incorrectItems.push({
            question: q.Question || q.question,
            topic: safeTopic
        });
    }

    currentSession.currentIndex++;

    if (currentSession.currentIndex < currentSession.questions.length) {
        renderQuestion();
    } else {
        completeExamSession();
    }
}

function startExamTimer() {
    const timerDisplay = document.getElementById('exam-timer');
    timerDisplay.style.color = 'var(--text-main)'; 
    
    const renderClockSnapshot = () => {
        const mins = Math.floor(currentSession.timeLeft / 60);
        const secs = currentSession.timeLeft % 60;
        timerDisplay.innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        
        if (currentSession.timeLeft <= 300) {
            timerDisplay.style.color = 'var(--error)';
        }
    };

    renderClockSnapshot();

    currentSession.timerInterval = setInterval(() => {
        currentSession.timeLeft--;
        renderClockSnapshot();

        if (currentSession.timeLeft <= 0) {
            clearInterval(currentSession.timerInterval);
            alert('Time limit expired! Computing scores.');
            completeExamSession();
        }
    }, 1000);
}

async function completeExamSession() {
    clearInterval(currentSession.timerInterval);
    document.getElementById('progress-bar').style.width = '100%';

    navigateToStage('results');

    const total = currentSession.questions.length;
    const finalScore = currentSession.score;

    document.getElementById('score-display').innerText = `${finalScore}/${total}`;

    const passingMark = Math.ceil(total * 0.8);
    const statusText = document.getElementById('passing-status');

    if (finalScore >= passingMark) {
        statusText.innerText = `PASSED - Required Score was ${passingMark}/${total}`;
        statusText.style.color = 'var(--success)';
    } else {
        statusText.innerText = `FAILED - Required Score is ${passingMark}/${total}`;
        statusText.style.color = 'var(--error)';
    }

    try {
        await fetch('/api/submit-exam', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: currentSession.user.id,
                exam_type: document.getElementById('exam-topic').value === 'all' ? 'Comprehensive' : `Focus: ${document.getElementById('exam-topic').value}`,
                language: document.getElementById('exam-lang').value,
                score: finalScore,
                total_questions: total,
                incorrect_items: currentSession.incorrectItems
            })
        });

        const matrixResponse = await fetch(`/api/performance/${currentSession.user.id}`);
        const performanceData = await matrixResponse.json();
        
        renderWeaknessMatrix(performanceData);

    } catch (error) {
        console.error('Failed to submit exam metrics or draw analytics grid:', error);
    }
}

function renderWeaknessMatrix(data) {
    const container = document.getElementById('performance-matrix');
    container.innerHTML = '';

    if (data.length === 0) {
        container.innerHTML = `<p style="color: var(--success); font-size: 0.9rem; font-weight:500;">Perfect execution. No clear topic weaknesses detected.</p>`;
        return;
    }

    data.forEach(item => {
        const row = document.createElement('div');
        row.style = "display: flex; justify-content: space-between; background: #fafafa; padding: 0.75rem 1rem; border: 1px solid var(--border); border-radius: 6px; font-size: 0.9rem;";
        row.innerHTML = `
            <span style="font-weight: 500; color: var(--primary-light); text-transform: capitalize;">${item.topic}</span>
            <span style="font-weight: 700; color: var(--error);">${item.mistakes_count} Missed</span>
        `;
        container.appendChild(row);
    });
}