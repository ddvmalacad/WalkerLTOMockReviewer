import express from 'express';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const app = express();
// Dynamic port allocation for Render, defaulting to 3000 locally
const PORT = process.env.PORT || 3000;

app.use(express.json());
// Serve frontend static files from the public directory
app.use(express.static('public')); 

// --- DATABASE CONFIGURATION ---
// Initializes a local SQL database file automatically.
// better-sqlite3 handles this synchronously during execution.
const db = new Database('./lto_reviewer.db', { verbose: console.log });
console.log('SQLite database storage ready via better-sqlite3.');

// Create tables synchronously
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        age INTEGER,
        learning_status TEXT
    );

    CREATE TABLE IF NOT EXISTS exam_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        exam_type TEXT,
        language TEXT,
        score INTEGER,
        total_questions INTEGER,
        date_taken TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS incorrect_answers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        attempt_id INTEGER,
        topic TEXT
    );
`);

// --- SERVER REST ENDPOINTS (APIs) ---

// API 1: Register New User Profile
app.post('/api/signup', (req, res) => {
    const { name, age, learning_status } = req.body;
    try {
        const stmt = db.prepare(`INSERT INTO users (name, age, learning_status) VALUES (?, ?, ?)`);
        const info = stmt.run(name, age, learning_status);
        
        // better-sqlite3 returns metadata on the info object (info.lastInsertRowid replaces this.lastID)
        res.json({ id: info.lastInsertRowid, name, age, learning_status });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// API 2: Dynamic Question Fetcher & Balancing Engine
app.get('/api/questions', (req, res) => {
    const { lang, type, topic } = req.query; // lang: 'en'/'tl', type: 'student'/'driver', topic: 'all' or name
    const filePath = path.join('data', `questions_${lang}.json`);

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) return res.status(500).json({ error: "Target data pool is unreadable or missing." });
        
        let pool = JSON.parse(data);
        
        // Filter out questions based on Student vs Driver target user
        let filtered = pool.filter(q => q.user_type === type);

        // If a student selects a specific exam category
        if (topic && topic !== 'all') {
            filtered = filtered.filter(q => q.topic.toLowerCase().trim() === topic.toLowerCase().trim());
        }

        // Apply strict LTO standard question layout cutoffs
        if (type === 'driver') {
            // Renewal exams are consistently exactly 25 items long
            filtered = filtered.sort(() => 0.5 - Math.random()).slice(0, 25);
        } else if (topic === 'all') {
            // General Mock exams compile exactly 60 randomized items across topics
            filtered = filtered.sort(() => 0.5 - Math.random()).slice(0, 60);
        }

        res.json(filtered);
    });
});

// API 3: Submit Finished Exam Results & Record Diagnostic Metrics
app.post('/api/submit-exam', (req, res) => {
    const { user_id, exam_type, language, score, total_questions, incorrect_items } = req.body;
    
    // We execute the multi-step insert within a performance-boosting Database Transaction
    const insertTransaction = db.transaction((attemptData, items) => {
        const attemptStmt = db.prepare(`
            INSERT INTO exam_attempts (user_id, exam_type, language, score, total_questions) 
            VALUES (?, ?, ?, ?, ?)
        `);
        const info = attemptStmt.run(
            attemptData.user_id, 
            attemptData.exam_type, 
            attemptData.language, 
            attemptData.score, 
            attemptData.total_questions
        );
        
        const attemptId = info.lastInsertRowid;

        if (items && items.length > 0) {
            const itemStmt = db.prepare(`INSERT INTO incorrect_answers (attempt_id, topic) VALUES (?, ?)`);
            for (const item of items) {
                itemStmt.run(attemptId, item.topic || "General Knowledge");
            }
        }
    });

    try {
        insertTransaction({ user_id, exam_type, language, score, total_questions }, incorrect_items);
        res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// API 4: Weakness Matrix Generator (Calculates mistakes grouped by topic)
app.get('/api/performance/:userId', (req, res) => {
    const { userId } = req.params;
    try {
        const stmt = db.prepare(`
            SELECT topic, COUNT(*) as mistakes_count FROM incorrect_answers 
            WHERE attempt_id IN (SELECT id FROM exam_attempts WHERE user_id = ?)
            GROUP BY topic ORDER BY mistakes_count DESC
        `);
        // .all() executes the query and directly outputs all matching rows as an array
        const rows = stmt.all(userId);
        res.json(rows);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => console.log(`Application actively hosted on port: ${PORT}`));