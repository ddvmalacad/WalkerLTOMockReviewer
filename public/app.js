// --- STATE MANAGEMENT SYSTEM ---
let currentSession = {
    userId: null,
    questions: [],
    currentIndex: 0,
    score: 0,
    incorrectItems: [],
    selectedAnswer: null,
    timerInterval: null,
    timeLeft: 3600 // 60 minutes default
};

// --- DOM ELEMENT ANCHORS ---
const stages = {
    auth: document.getElementById('auth-stage'),
    exam: document.getElementById('exam-stage'),
    results: document.getElementById('results-stage')
};

// --- INITIALIZATION EVENTS ---
document.getElementById('start-btn').addEventListener('click', initializeSession);
document.getElementById('next-btn').addEventListener('click', advanceQuestion);
document.getElementById('restart-btn').addEventListener('click', () => window.location.reload());

// --- STAGE 1: AUTHENTICATION & INITIALIZATION ---
async function initializeSession() {
    const name = document.getElementById('username').value.trim();
    const age = parseInt(document.getElementById('userage').value);
    const learningStatus = document.getElementById('learning-status').value;
    const lang = document.getElementById('exam-lang').value;
    const topic = document.getElementById('exam-topic').value;

    if (!name || !age) {
        alert('Please fill out all identification fields before starting.');
        return;
    }

    try {
        // 1. Register User Profile in SQLite via Backend API
        const authResponse = await fetch('/api/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, age, learning_status: learningStatus })
        });
        const user = await authResponse.json();
        currentSession.userId = user.id;

        // 2. Fetch Questions Filtered by Language, Application Type, and chosen Topic Focus
        const questionsResponse = await fetch(`/api/questions?lang=${lang}&type=${learningStatus}&topic=${topic}`);
        currentSession.questions = await questionsResponse.json();

        if (currentSession.questions.length === 0) {
            alert('The question pool for this specific topic combination is empty or missing.');
            return;
        }

        // 3. Adjust Timer based on LTO rules (25 items for renewal vs 60 items for comprehensive)
        currentSession.timeLeft = learningStatus === 'driver' ? 30 * 60 : 60 * 60;

        // 4. Interface Transition
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

    const q = currentSession.questions[currentSession.currentIndex];
    
    // Update Counter & Progress Bar
    document.getElementById('question-counter').innerText = `Question ${currentSession.currentIndex + 1} of ${currentSession.questions.length}`;
    const progressPercent = (currentSession.currentIndex / currentSession.questions.length) * 100;
    document.getElementById('progress-bar').style.width = `${progressPercent}%`;

    // Display Question
    document.getElementById('question-display').innerText = q.question;

    // Render Option Rows
    const optionsContainer = document.getElementById('options-display');
    optionsContainer.innerHTML = '';

    q.options.forEach((option) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerText = option;
        
        btn.addEventListener('click', () => {
            if (currentSession.selectedAnswer !== null) return; // Prevent changing selections
            
            currentSession.selectedAnswer = option;
            
            // Minimalist selection micro-interaction highlight
            btn.classList.add('selected');
            nextBtn.classList.remove('hidden');
        });

        optionsContainer.appendChild(btn);
    });
}

// --- NAVIGATION & METRIC COLLECTION ---
function advanceQuestion() {
    const q = currentSession.questions[currentSession.currentIndex];
    const isCorrect = (currentSession.selectedAnswer === q.correct_answer);

    // Track state metrics
    if (isCorrect) {
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
            timerDisplay.style.color = 'var(--error)'; // Alert user when under 5 minutes left
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
    const learningStatus = document.getElementById('learning-status').value;

    // Render score metrics
    document.getElementById('score-display').innerText = `${finalScore}/${total}`;

    // LTO Passing Mark Threshold calculations
    const passingMark = learningStatus === 'driver' ? 20 : 48; // 20/25 for renewal, 48/60 for non-pro
    const statusText = document.getElementById('passing-status');

    if (finalScore >= passingMark) {
        statusText.innerText = 'PASSED - Ready for LTO Portal Evaluation';
        statusText.style.color = 'var(--success)';
    } else {
        statusText.innerText = `FAILED - Passing Score is ${passingMark}/${total}`;
        statusText.style.color = 'var(--error)';
    }

    // Save exam attempt history payload to backend database via REST
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

        // Load performance dashboard telemetry from backend metrics generator
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