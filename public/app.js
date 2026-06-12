// --- STATE MANAGEMENT SYSTEM ---
let currentSession = {
    userId: null,
    questions: [],
    currentIndex: 0,
    score: 0,
    incorrectItems: [],
    selectedAnswer: null,
    isSelectedAnswerCorrect: false, // Dynamic validation state cache
    timerInterval: null,
    timeLeft: 3600 // 60 minutes default
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

// --- UNIVERSAL EVALUATION ENGINE ---
// Validates responses regardless of whether the JSON uses raw text, indices (0,1,2), or alphabet keys (A,B,C)
function checkIsCorrect(optionText, index, correctAnswer) {
    const cleanOption = String(optionText).toLowerCase().trim();
    const cleanCorrect = String(correctAnswer).toLowerCase().trim();
    
    const alphaKey = String.fromCharCode(65 + index).toLowerCase(); // 0 -> 'a', 1 -> 'b', 2 -> 'c'
    const indexStr0 = String(index);                               // 0-based array lookup ('0', '1'...)
    const indexStr1 = String(index + 1);                           // 1-based index lookup ('1', '2'...)

    return cleanOption === cleanCorrect || 
           alphaKey === cleanCorrect || 
           indexStr0 === cleanCorrect || 
           indexStr1 === cleanCorrect;
}

// --- STAGE 1: AUTHENTICATION & INITIALIZATION ---
async function initializeSession() {
    const name = document.getElementById('username').value.trim();
    const age = parseInt(document.getElementById('userage').value);
    const learningStatus = learningStatusSelect.value;
    const lang = document.getElementById('exam-lang').value;
    const topic = examTopicSelect.value;

    if (!name || !age) {
        alert('Please fill out all identification fields before starting.');
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

        currentSession.timeLeft = learningStatus === 'driver' ? 30 * 60 : 60 * 60;

        stages.auth.classList.add('hidden');
        stages.exam.classList.remove('hidden');

        startExamTimer();
        renderQuestion();

    } catch (error) {
        console.error('Session boot failure:', error);
        alert('An error occurred while preparing your exam environment.');
    }
}

// --- STAGE 2: QUIZ LOOP CORE ---
function renderQuestion() {
    const nextBtn = document.getElementById('next-btn');
    nextBtn.classList.add('hidden');
    
    currentSession.selectedAnswer = null;
    currentSession.isSelectedAnswerCorrect = false;

    const q = currentSession.questions[currentSession.currentIndex];
    
    document.getElementById('question-counter').innerText = `Question ${currentSession.currentIndex + 1} of ${currentSession.questions.length}`;
    const progressPercent = (currentSession.currentIndex / currentSession.questions.length) * 100;
    document.getElementById('progress-bar').style.width = `${progressPercent}%`;

    document.getElementById('question-display').innerText = q.question;

    const optionsContainer = document.getElementById('options-display');
    optionsContainer.innerHTML = '';

    q.options.forEach((option, index) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerText = option;
        
        btn.addEventListener('click', () => {
            if (currentSession.selectedAnswer !== null) return; // Disallow answer modifications
            
            currentSession.selectedAnswer = option;
            const isCorrect = checkIsCorrect(option, index, q.correct_answer);
            currentSession.isSelectedAnswerCorrect = isCorrect;
            
            if (isCorrect) {
                btn.style.backgroundColor = 'var(--success)';
                btn.style.borderColor = 'var(--success)';
                btn.style.color = '#ffffff';
            } else {
                btn.style.backgroundColor = 'var(--error)';
                btn.style.borderColor = 'var(--error)';
                btn.style.color = '#ffffff';
                
                // Highlight the correct alternative button out of the sibling list array positions
                const siblingButtons = optionsContainer.querySelectorAll('.option-btn');
                siblingButtons.forEach((sibling, sIndex) => {
                    if (checkIsCorrect(sibling.innerText, sIndex, q.correct_answer)) {
                        sibling.style.backgroundColor = 'var(--success)';
                        sibling.style.borderColor = 'var(--success)';
                        sibling.style.color = '#ffffff';
                    }
                });
            }
            
            nextBtn.classList.remove('hidden');
        });

        optionsContainer.appendChild(btn);
    });
}

// --- NAVIGATION & METRIC COLLECTION ---
function advanceQuestion() {
    const q = currentSession.questions[currentSession.currentIndex];

    if (currentSession.isSelectedAnswerCorrect) {
        currentSession.score++;
    } else {
        currentSession.incorrectItems.push({
            question: q.question,
            topic: q.topic
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
function startExamTimer() {
    const timerDisplay = document.getElementById('exam-timer');
    
    currentSession.timerInterval = setInterval(() => {
        currentSession.timeLeft--;
        
        const mins = Math.floor(currentSession.timeLeft / 60);
        const secs = currentSession.timeLeft % 60;
        timerDisplay.innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

        if (currentSession.timeLeft <= 300) {
            timerDisplay.style.color = 'var(--error)';
        }

        if (currentSession.timeLeft <= 0) {
            clearInterval(currentSession.timerInterval);
            alert('Time limit expired! Auto-submitting answers.');
            completeExamSession();
        }
    }, 1000);
}

// --- STAGE 3: METRICS PROCESSING & COMPLETION ---
async function completeExamSession() {
    clearInterval(currentSession.timerInterval);
    document.getElementById('progress-bar').style.width = '100%';

    stages.exam.classList.add('hidden');
    stages.results.classList.remove('hidden');

    const total = currentSession.questions.length;
    const finalScore = currentSession.score;
    const learningStatus = learningStatusSelect.value;

    document.getElementById('score-display').innerText = `${finalScore}/${total}`;

    let passingMark;
    if (total === 10) {
        passingMark = 8; 
    } else {
        passingMark = learningStatus === 'driver' ? 20 : 48; 
    }

    const statusText = document.getElementById('passing-status');

    if (finalScore >= passingMark) {
        statusText.innerText = 'PASSED - Ready for LTO Portal Evaluation';
        statusText.style.color = 'var(--success)';
    } else {
        statusText.innerText = `FAILED - Passing Score is ${passingMark}/${total}`;
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