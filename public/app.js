// --- STATE MANAGEMENT SYSTEM ---
let currentSession = {
    userId: null,
    questions: [],
    currentIndex: 0,
    score: 0,
    incorrectItems: [],
    selectedAnswer: null,
    isSelectedAnswerCorrect: false, 
    timerInterval: null,
    timeLeft: 3600 // Fallback dynamic state tracking
};

// --- DOM ELEMENT ANCHORS ---
const stages = {
    auth: document.getElementById('auth-stage'),
    exam: document.getElementById('exam-stage'),
    results: document.getElementById('results-stage')
};

const learningStatusSelect = document.getElementById('learning-status');
const examTopicSelect = document.getElementById('exam-topic');

// --- INITIALIZATION EVENTS ---
document.getElementById('start-btn').addEventListener('click', initializeSession);
document.getElementById('next-btn').addEventListener('click', advanceQuestion);
document.getElementById('restart-btn').addEventListener('click', () => window.location.reload());

// --- UI INTERLOCK: RESTRICT PROFESSIONAL EXAMS TO FULL MOCK ONLY ---
learningStatusSelect.addEventListener('change', () => {
    if (learningStatusSelect.value === 'driver') {
        examTopicSelect.value = 'all';
        examTopicSelect.disabled = true;
        examTopicSelect.style.opacity = '0.6';
        examTopicSelect.style.cursor = 'not-allowed';
    } else {
        examTopicSelect.disabled = false;
        examTopicSelect.style.opacity = '1';
        examTopicSelect.style.cursor = 'default';
    }
});

// --- UNIVERSAL EVALUATION ENGINE (CASE & KEY INSENSITIVE) ---
function checkIsCorrect(optionText, index, q) {
    // Gracefully reads both uppercase (Excel) and lowercase database keys
    const rawCorrect = q.Correct_Answer !== undefined ? q.Correct_Answer : 
                       (q.correct_answer !== undefined ? q.correct_answer : q.answer);
    
    if (rawCorrect === undefined) {
        console.error("DATABASE SCHEMA WARNING: Missing correct answer key alignment!", q);
        return false; 
    }

    const cleanOption = String(optionText).toLowerCase().trim();
    const cleanCorrect = String(rawCorrect).toLowerCase().trim();

    if (cleanOption === cleanCorrect) return true;

    // Direct text normalization filtering 
    const pureOption = cleanOption.replace(/[^a-z0-9]/g, '');
    const pureCorrect = cleanCorrect.replace(/[^a-z0-9]/g, '');
    if (pureOption === pureCorrect && pureOption.length > 0) return true;

    // Letter index fallback check (A, B, C, D)
    const alphaKey = String.fromCharCode(65 + index).toLowerCase(); 
    if (pureCorrect === alphaKey) return true;

    return false;
}

// --- STAGE 1: AUTHENTICATION & INITIALIZATION ---
async function initializeSession() {
    const name = document.getElementById('username').value.trim();
    const age = parseInt(document.getElementById('userage').value);
    const learningStatus = learningStatusSelect.value;
    const lang = document.getElementById('exam-lang').value;
    const topic = examTopicSelect.value;

    if (!name || !age) {
        alert('Please fill out all identity fields before beginning.');
        return;
    }

    try {
        const authResponse = await fetch('/api/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, age, learning_status: learningStatus })
        });
        const user = await authResponse.json();
        currentSession.userId = user.id;

        const questionsResponse = await fetch(`/api/questions?lang=${lang}&type=${learningStatus}&topic=${topic}`);
        currentSession.questions = await questionsResponse.json();

        if (currentSession.questions.length === 0) {
            alert('The question pool for this specific topic combination is empty or missing.');
            return;
        }

        // --- TIMER ALLOCATION ENGINE ---
        if (topic !== 'all') {
            currentSession.timeLeft = 20 * 60; // Topic Focus Category -> 20 Minutes
        } else if (learningStatus === 'driver') {
            currentSession.timeLeft = 30 * 60; // Professional Renewal -> 30 Minutes
        } else {
            currentSession.timeLeft = 60 * 60; // Student Comprehensive -> 60 Minutes
        }

        stages.auth.classList.add('hidden');
        stages.exam.classList.remove('hidden');

        startExamTimer();
        renderQuestion();

    } catch (error) {
        console.error('Session boot failure:', error);
        alert('An error occurred while preparing your exam environment.');
    }
}

// --- STAGE 2: APPLICATION ENGINE CORE ---
function renderQuestion() {
    const nextBtn = document.getElementById('next-btn');
    nextBtn.classList.add('hidden');
    
    currentSession.selectedAnswer = null;
    currentSession.isSelectedAnswerCorrect = false;

    const q = currentSession.questions[currentSession.currentIndex];
    
    document.getElementById('question-counter').innerText = `Question ${currentSession.currentIndex + 1} of ${currentSession.questions.length}`;
    const progressPercent = (currentSession.currentIndex / currentSession.questions.length) * 100;
    document.getElementById('progress-bar').style.width = `${progressPercent}%`;

    // Safe extraction of question text property
    document.getElementById('question-display').innerText = q.Question || q.question;

    const optionsContainer = document.getElementById('options-display');
    optionsContainer.innerHTML = '';

    // Coalesce options from uppercase (Excel) and lowercase keys
    const rawOptions = [
        q.Option_A || q.option_a,
        q.Option_B || q.option_b,
        q.Option_C || q.option_c,
        q.Option_D || q.option_d
    ];

    // CLEANER FILTER: Removes any empty rows, nulls, or spaces from drawing a button element
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
                
                // Track down the correct alternative button and light it up green
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

// --- METRIC MANAGEMENT & ARCHIVAL ---
function advanceQuestion() {
    const q = currentSession.questions[currentSession.currentIndex];
    const safeTopic = q.Topic || q.topic || 'General';

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

// --- COUNTDOWN SYSTEM ---
// --- COUNTDOWN SYSTEM ---
function startExamTimer() {
    const timerDisplay = document.getElementById('exam-timer');
    
    // Create a helper function to update the screen
    const updateDisplay = () => {
        const mins = Math.floor(currentSession.timeLeft / 60);
        const secs = currentSession.timeLeft % 60;
        timerDisplay.innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        
        if (currentSession.timeLeft <= 300) {
            timerDisplay.style.color = 'var(--error)';
        }
    };

    // 1. Run it IMMEDIATELY so the user never sees the hardcoded "60:00"
    updateDisplay(); 
    
    // 2. Then start the 1-second interval loop
    currentSession.timerInterval = setInterval(() => {
        currentSession.timeLeft--;
        updateDisplay();

        if (currentSession.timeLeft <= 0) {
            clearInterval(currentSession.timerInterval);
            alert('Time limit expired! Processing exam results.');
            completeExamSession();
        }
    }, 1000);
}

// --- STAGE 3: PERFORMANCE METRICS DISPLAY ---
async function completeExamSession() {
    clearInterval(currentSession.timerInterval);
    document.getElementById('progress-bar').style.width = '100%';

    stages.exam.classList.add('hidden');
    stages.results.classList.remove('hidden');

    const total = currentSession.questions.length;
    const finalScore = currentSession.score;
    const learningStatus = learningStatusSelect.value;

    document.getElementById('score-display').innerText = `${finalScore}/${total}`;

    // Dynamic 80% passing mark rule handles variable lengths flawlessly
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
                user_id: currentSession.userId,
                exam_type: learningStatus,
                language: document.getElementById('exam-lang').value,
                score: finalScore,
                total_questions: total,
                incorrect_items: currentSession.incorrectItems
            })
        });

        const matrixResponse = await fetch(`/api/performance/${currentSession.userId}`);
        const performanceData = await matrixResponse.json();
        
        renderWeaknessMatrix(performanceData);

    } catch (error) {
        console.error('Data metric archival failed:', error);
    }
}

function renderWeaknessMatrix(data) {
    const container = document.getElementById('performance-matrix');
    container.innerHTML = '';

    if (data.length === 0) {
        container.innerHTML = `<p style="color: var(--success); font-size: 0.9rem; font-weight:500;">Perfect score recorded! No structural weaknesses detected.</p>`;
        return;
    }

    data.forEach(item => {
        const row = document.createElement('div');
        row.style = `
            display: flex; 
            justify-content: space-between; 
            background: #fafafa; 
            padding: 0.75rem 1rem; 
            border: 1px solid var(--border); 
            border-radius: 6px;
            font-size: 0.9rem;
        `;
        row.innerHTML = `
            <span style="font-weight: 500; color: var(--primary-light); text-transform: capitalize;">${item.topic}</span>
            <span style="font-weight: 700; color: var(--error);">${item.mistakes_count} Missed</span>
        `;
        container.appendChild(row);
    });
}