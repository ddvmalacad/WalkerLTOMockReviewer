import express from 'express';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public')); 

// --- DATABASE CONFIGURATION ---
const db = new Database('./lto_reviewer.db', { verbose: console.log });
console.log('SQLite database storage ready via better-sqlite3.');

// Create tables synchronously using sealed template literals
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
        res.json({ id: info.lastInsertRowid, name, age, learning_status });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// API 2: Simple Login System (For Dashboard Resumption)
app.post('/api/login', (req, res) => {
    const { name } = req.body;
    try {
        const stmt = db.prepare(`SELECT * FROM users WHERE name = ? COLLATE NOCASE`);
        const user = stmt.get(name);
        
        if (user) {
            res.json(user);
        } else {
            res.status(404).json({ error: "User not found. Please register." });
        }
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// API 3: Fetch Exam History for User Dashboard
app.get('/api/history/:userId', (req, res) => {
    const { userId } = req.params;
    try {
        const stmt = db.prepare(`
            SELECT exam_type, score, total_questions, date_taken 
            FROM exam_attempts 
            WHERE user_id = ? 
            ORDER BY date_taken DESC
        `);
        const history = stmt.all(userId);
        res.json(history);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// API 4: Dynamic Question Fetcher & File Router Engine
app.get('/api/questions', (req, res) => {
    try {
        const { lang, type, topic } = req.query;

        // 1. Standardize language tags
        const cleanLang = (lang === 'tg' || lang === 'tl') ? 'tg' : 'en';
        
        // 2. Identify the targeted content variant set 
        const setSuffix = (type === 'driver') ? 'setB' : 'setA';

        let targetFile = '';

        // 3. Dynamic Router Map Logic for JSON Data Sources
        if (!topic || topic === 'all') {
            if (type === 'driver') {
                targetFile = `renex_${cleanLang}.json`; // Renewal Exam pool
            } else {
                targetFile = `genex_${cleanLang}.json`; // General Exam pool
            }
        } else {
            targetFile = `topic_${cleanLang}_${setSuffix}.json`; // Focused subtopic set
        }

        const filePath = path.join('data', targetFile);

        // 4. Fallback fail-safe validation check
        if (!fs.existsSync(filePath)) {
            console.error(`ERROR: Missing JSON data source file target -> ${targetFile}`);
            return res.status(404).json({ error: `The requested exam database target (${targetFile}) is missing.` });
        }

        const rawData = fs.readFileSync(filePath, 'utf8');
        let filtered = JSON.parse(rawData);

        // 5. In-Memory Filter execution and Randomized Slice Caps
        if (!topic || topic === 'all') {
            if (type === 'driver') {
                // LTO Professional Renewal Exam Blueprint
                filtered = filtered.sort(() => 0.5 - Math.random()).slice(0, 25);
            } else {
                // LTO Student & Non-Professional Exam Blueprint
                filtered = filtered.sort(() => 0.5 - Math.random()).slice(0, 60);
            }
        } else {
            // Forgiving Fuzzy Topic Matcher for the 6 Core Topics
            filtered = filtered.filter(q => {
                const qTopic = q.Topic || q.topic || '';
                
                // Strips all spaces, casing, and symbols so "Road & Traffic" matches "road and traffic"
                const cleanDbTopic = qTopic.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
                const cleanTargetTopic = topic.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
                
                return cleanDbTopic === cleanTargetTopic || cleanDbTopic.includes(cleanTargetTopic);
            });
            
            // Subcategory Focus Session Cap
            filtered = filtered.sort(() => 0.5 - Math.random()).slice(0, 10);
        }

        res.json(filtered);

    } catch (error) {
        console.error("API 4 Question Router Failure:", error);
        res.status(500).json({ error: "Failed to resolve and process the question payload database." });
    }
});

// API 5: Submit Finished Exam Results & Record Diagnostic Metrics
app.post('/api/submit-exam', (req, res) => {
    const { user_id, exam_type, language, score, total_questions, incorrect_items } = req.body;
    
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
                const itemTopic = item.topic || item.Topic || "General Knowledge";
                itemStmt.run(attemptId, itemTopic);
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

// API 6: Weakness Matrix Generator
app.get('/api/performance/:userId', (req, res) => {
    const { userId } = req.params;
    try {
        const stmt = db.prepare(`
            SELECT topic, COUNT(*) as mistakes_count FROM incorrect_answers 
            WHERE attempt_id IN (SELECT id FROM exam_attempts WHERE user_id = ?)
            GROUP BY topic ORDER BY mistakes_count DESC
        `);
        const rows = stmt.all(userId);
        res.json(rows);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => console.log(`Application actively hosted on port: ${PORT}`));