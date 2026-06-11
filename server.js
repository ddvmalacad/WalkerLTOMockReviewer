import express from 'express';
import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';

const app = express();
const PORT = 3000;

app.use(express.json());
// Serve frontend static files from the public directory
app.use(express.static('public')); 

// --- DATABASE CONFIGURATION ---
// Initializes a local SQL database file automatically
const db = new sqlite3.Database('./lto_reviewer.db', (err) => {
    if (err) console.error("Database connection failed:", err.message);
    else console.log('SQLite database storage ready.');
});

db.serialize(() => {
    // 1. User Profiles
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        age INTEGER,
        learning_status TEXT
    )`);

    // 2. Comprehensive Exam Analytics Tracking
    db.run(`CREATE TABLE IF NOT EXISTS exam_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        exam_type TEXT,
        language TEXT,
        score INTEGER,
        total_questions INTEGER,
        date_taken TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    // 3. Granular Error Diagnostics Tracker
    db.run(`CREATE TABLE IF NOT EXISTS incorrect_answers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        attempt_id INTEGER,
        topic TEXT
    )`);
});

// --- SERVER REST ENDPOINTS (APIs) ---

// API 1: Register New User Profile
app.post('/api/signup', (req, res) => {
    const { name, age, learning_status } = req.body;
    db.run(`INSERT INTO users (name, age, learning_status) VALUES (?, ?, ?)`, 
    [name, age, learning_status], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, name, age, learning_status });
    });
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
    
    db.run(`INSERT INTO exam_attempts (user_id, exam_type, language, score, total_questions) VALUES (?, ?, ?, ?, ?)`,
    [user_id, exam_type, language, score, total_questions], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        
        const attemptId = this.lastID;
        
        // Log individual missed items to populate the analytical weakness tracker
        if (incorrect_items && incorrect_items.length > 0) {
            const stmt = db.prepare(`INSERT INTO incorrect_answers (attempt_id, topic) VALUES (?, ?)`);
            incorrect_items.forEach(item => {
                stmt.run(attemptId, item.topic || "General Knowledge");
            });
            stmt.finalize();
        }
        res.json({ success: true });
    });
});

// API 4: Weakness Matrix Generator (Calculates mistakes grouped by topic)
app.get('/api/performance/:userId', (req, res) => {
    const { userId } = req.params;
    db.all(`SELECT topic, COUNT(*) as mistakes_count FROM incorrect_answers 
            WHERE attempt_id IN (SELECT id FROM exam_attempts WHERE user_id = ?)
            GROUP BY topic ORDER BY mistakes_count DESC`, [userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.listen(PORT, () => console.log(`Application actively hosted on: http://localhost:${PORT}`));