// --- APPLICATION STATE VARIABLES ---
let currentUser = null;
let activeQuestionPool = [];
let currentQuestionIndex = 0;
let userScore = 0;
let incorrectItemsTracker = [];

// --- VIEW CONTROLLER ---
function switchView(viewId) {
    document.getElementById('auth-view').classList.add('hidden');
    document.getElementById('dashboard-view').classList.add('hidden');
    document.getElementById('quiz-view').classList.add('hidden');
    document.getElementById('results-view').classList.add('hidden');

    document.getElementById(viewId).classList.remove('hidden');
}

// --- USER MANAGEMENT (SIGNUP) ---
async function registerUser() {
    const name = document.getElementById('username').value.trim();
    const age = parseInt(document.getElementById('userage').value);
    const learning_status = document.getElementById('userstatus').value;

    if (!name || !age) {
        alert("Please provide both your name and age to enter the portal.");
        return;
    }

    try {
        const response = await fetch('/api/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, age, learning_status })
        });

        currentUser = await response.json();
        
        // Update Dashboard Welcome Elements
        document.getElementById('display-name').textContent = currentUser.name;
        
        // Tailor UI options based on License Status selection
        const topicsContainer = document.getElementById('student-topics-container');
        if (currentUser.learning_status === 'driver') {
            topicsContainer.classList.add('hidden'); // Drivers only take standard Renewal exams
        } else {
            topicsContainer.classList.remove('hidden'); // Students can pick categories
        }

        switchView('dashboard-view');
        fetchPerformanceAnalytics();

    } catch (err) {
        console.error("Signup tracking failed:", err);
        alert("Could not connect to the local server. Is 'node server.js' running?");
    }
}

// --- ANALYTICS INSIGHTS FETCH ---
async function fetchPerformanceAnalytics() {
    const deck = document.getElementById('analytics-deck');
    if (!currentUser) return;

    try {
        const response = await fetch(`/api/performance/${currentUser.id}`);
        const rows = await response.json();

        if (rows.length === 0) {
            deck.innerHTML = `<p style='color:gray; text-align:center;'>No test history recorded yet. Complete an exam to calculate your weakest categories!</p>`;
            return;
        }

        deck.innerHTML = rows.map(row => `
            <div class="metric-card">
                <strong>${row.topic}</strong>: ${row.mistakes_count} total mistake(s) registered
            </div>
        `).join('');

    } catch (err) {
        deck.innerHTML = `<p style='color:red;'>Failed to load diagnostics framework.</p>`;
    }
}

// --- QUIZ LAYOUT INITIALIZATION ---
async function initializeExamination() {
    const lang = document.getElementById('exam-lang').value;
    const scopeElement = document.getElementById('exam-scope');
    const topic = currentUser.learning_status === 'driver' ? 'all' : scopeElement.value;

    try {
        const queryParams = `?lang=${lang}&type=${currentUser.learning_status}&topic=${encodeURIComponent(topic)}`;
        const response = await fetch(`/api/questions${queryParams}`);
        activeQuestionPool = await response.json();

        if (activeQuestionPool.length === 0) {
            alert("No matching questions found in the database. Ensure your data/ folder is fully populated!");
            return;
        }

        // Reset tracking states
        currentQuestionIndex = 0;
        userScore = 0;
        incorrectItemsTracker = [];

        switchView('quiz-view');
        renderActiveQuestion();

    } catch (err) {
        console.error("Could not fetch question pool array:", err);
        alert("Error launching testing engine.");
    }
}

// --- RENDER CURRENT ACTIVE ITEM ---
function renderActiveQuestion() {
    const question = activeQuestionPool[currentQuestionIndex];
    
    // Hide 'Next' button until user choices are explicitly verified
    document.getElementById('next-item-btn').classList.add('hidden');

    // Update Progress Bars and Titles
    document.getElementById('quiz-progress').textContent = `Question ${currentQuestionIndex + 1} of ${activeQuestionPool.length}`;
    document.getElementById('quiz-topic').textContent = question.topic || "General Knowledge";
    document.getElementById('quiz-question-text').textContent = question.question;

    const optionsBox = document.getElementById('quiz-options-box');
    optionsBox.innerHTML = '';

    // Render interactive multi-choice option buttons dynamically
    question.options.forEach(optionText => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.textContent = optionText;
        btn.onclick = () => verifyUserChoice(btn, optionText, question);
        optionsBox.appendChild(btn);
    });
}

// --- INTERACTIVE VERIFICATION LOGIC (COLOR SHIFT ENGINE) ---
function verifyUserChoice(selectedButton, chosenText, questionItem) {
    const optionsBox = document.getElementById('quiz-options-box');
    const buttons = optionsBox.getElementsByClassName('option-btn');

    // Freeze inputs to block duplicate point-scoring tampering
    for (let btn of buttons) {
        btn.disabled = true;
        
        // Turn the absolute correct choice green immediately
        if (btn.textContent === questionItem.answer) {
            btn.classList.add('correct');
        }
    }

    if (chosenText === questionItem.answer) {
        userScore++;
    } else {
        // If wrong, highlight user selection red and log to weak analytics array
        selectedButton.classList.add('wrong');
        incorrectItemsTracker.push({
            id: questionItem.id,
            topic: questionItem.topic || "General Knowledge"
        });
    }

    // Unveil forward progression control
    document.getElementById('next-item-btn').classList.remove('hidden');
}

// --- CYCLE POOL PROGRESSION ---
function advanceNextQuestion() {
    currentQuestionIndex++;
    if (currentQuestionIndex < activeQuestionPool.length) {
        renderActiveQuestion();
    } else {
        processExamFinalization();
    }
}

// --- SCORE SUBMISSION PROCESSOR ---
async function processExamFinalization() {
    const lang = document.getElementById('exam-lang').value;
    const examTypeLabel = currentUser.learning_status === 'driver' ? 'Driver Renewal' : 'Student Mock';

    try {
        await fetch('/api/submit-exam', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: currentUser.id,
                exam_type: examTypeLabel,
                language: lang,
                score: userScore,
                total_questions: activeQuestionPool.length,
                incorrect_items: incorrectItemsTracker
            })
        });
    } catch (err) {
        console.error("Analytics syncing failed to reach database file:", err);
    }

    // Display Outcomes Breakdown
    document.getElementById('score-display').textContent = `${userScore} / ${activeQuestionPool.length}`;
    
    // Calculate standard LTO pass metrics threshold cutoffs (usually 80% passing grade)
    const passingRatio = userScore / activeQuestionPool.length;
    const banner = document.getElementById('pass-fail-banner');
    
    if (passingRatio >= 0.80) {
        banner.textContent = "PASSED! Excellent knowledge mastery status.";
        banner.style.color = "green";
    } else {
        banner.textContent = "FAILED. Review your targeted error cards on the dashboard.";
        banner.style.color = "red";
    }

    switchView('results-view');
}

// --- PORTAL RESET ENGINE ---
function returnToDashboard() {
    switchView('dashboard-view');
    fetchPerformanceAnalytics(); // Refresh the weakness list based on recent test mistakes
}