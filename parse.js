import fs from 'fs';
import path from 'path';

// --- CONFIGURATION ---
const CATEGORY_MAP = {
    "road signs and pavement markings": "Road Signs and Pavement Markings",
    "road and traffic rules": "Road and Traffic Rules",
    "safe driving principles": "Safe Driving Principles",
    "land transportation laws and violations": "Land Transportation Laws and Violations",
    "licensing information and general knowledge": "Licensing Information and General Knowledge",
    "vehicle maintenance and troubleshooting": "Vehicle Maintenance and Troubleshooting"
};

// ============================================================================
// TOOL 1: CATEGORIZED PARSER (For TRE Files)
// ============================================================================

function parseAnswerFile(filePath) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const sections = raw.split(/\/\/|(?=\b[A-Za-z ]+\b\r?\n\d)/);
    const answersBySection = {};
    let currentTopic = "";

    sections.forEach(section => {
        const lines = section.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length === 0) return;

        const headingCheck = lines[0].replace(/^\/\//, '').trim().toLowerCase();
        if (CATEGORY_MAP[headingCheck]) {
            currentTopic = CATEGORY_MAP[headingCheck];
            answersBySection[currentTopic] = {};
        }

        lines.forEach(line => {
            const match = line.match(/^(\d+)\s*[\.:]\s*([a-c])/i);
            if (match && currentTopic) {
                answersBySection[currentTopic][parseInt(match[1])] = match[2].toLowerCase();
            }
        });
    });
    return answersBySection;
}

function compileExamSet(qFile, aFile, outputJsonName, userType, langPrefix, setLabel) {
    if (!fs.existsSync(qFile) || !fs.existsSync(aFile)) {
        console.warn(`[TRE] Skipping missing pair: ${qFile} or ${aFile}`);
        return;
    }

    const qRaw = fs.readFileSync(qFile, 'utf8');
    const masterAnswers = parseAnswerFile(aFile);
    const sections = qRaw.split(/(?=\/\/[A-Za-z ]+)/);
    const finalizedQuestions = [];

    sections.forEach(section => {
        const lines = section.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length === 0) return;

        const headingCheck = lines[0].replace(/^\/\//, '').trim().toLowerCase();
        const officialTopic = CATEGORY_MAP[headingCheck];
        if (!officialTopic) return;

        const blocks = section.split(/(?=\b\d+[\.\t])/);
        blocks.forEach(block => {
            const trimmedBlock = block.trim();
            if (!trimmedBlock) return;

            const numMatch = trimmedBlock.match(/^(\d+)[\.\t]\s*/);
            if (!numMatch) return;
            const qNum = parseInt(numMatch[1]);

            const blockLines = trimmedBlock.split('\n').map(l => l.trim()).filter(Boolean);
            let questionText = "";
            let optionsMap = { a: "", b: "", c: "" };

            blockLines.forEach(line => {
                if (line.match(/^\d+[\.\t]\s*/)) questionText = line.replace(/^\d+[\.\t]\s*/, '').trim();
                else if (line.match(/^a\.\s*/i)) optionsMap.a = line.replace(/^a\.\s*/i, '').trim();
                else if (line.match(/^b\.\s*/i)) optionsMap.b = line.replace(/^b\.\s*/i, '').trim();
                else if (line.match(/^c\.\s*/i)) optionsMap.c = line.replace(/^c\.\s*/i, '').trim();
                else if (questionText && !line.match(/^[a-c]\.\s*/i)) questionText += " " + line;
            });

            const correctLetter = masterAnswers[officialTopic]?.[qNum];
            if (!correctLetter || !optionsMap[correctLetter]) return;

            finalizedQuestions.push({
                id: `${langPrefix}_${officialTopic.replace(/\s+/g, '_').toLowerCase()}_${setLabel}_${qNum}`,
                user_type: userType,
                topic: officialTopic,
                question: questionText,
                options: [optionsMap.a, optionsMap.b, optionsMap.c],
                answer: optionsMap[correctLetter]
            });
        });
    });

    saveToJson(outputJsonName, finalizedQuestions, qFile);
}

// ============================================================================
// TOOL 2: STRAIGHT LIST PARSER (For Genex & Renex Files)
// ============================================================================

function compileStraightList(qFile, aFile, outputJsonName, userType, topicName, langPrefix, setLabel) {
    if (!fs.existsSync(qFile) || !fs.existsSync(aFile)) {
        console.warn(`[Straight List] Skipping missing pair: ${qFile} or ${aFile}`);
        return;
    }

    const qRaw = fs.readFileSync(qFile, 'utf8');
    const aRaw = fs.readFileSync(aFile, 'utf8');

    // Parse the straight answer key
    const answerKey = {};
    const answerMatches = aRaw.matchAll(/(\d+)\s*[\.:]\s*([a-c])/gi);
    for (const match of answerMatches) {
        answerKey[parseInt(match[1])] = match[2].toLowerCase();
    }

    const finalizedQuestions = [];
    const blocks = qRaw.split(/(?=\b\d+[\.\t]\s+)/); // Split by "1. ", "2. ", etc.

    blocks.forEach(block => {
        const trimmedBlock = block.trim();
        if (!trimmedBlock) return;

        const numMatch = trimmedBlock.match(/^(\d+)[\.\t]\s*/);
        if (!numMatch) return;
        const qNum = parseInt(numMatch[1]);

        const blockLines = trimmedBlock.split('\n').map(l => l.trim()).filter(Boolean);
        let questionText = "";
        let optionsMap = { a: "", b: "", c: "" };

        blockLines.forEach(line => {
            if (line.match(/^\d+[\.\t]\s*/)) questionText = line.replace(/^\d+[\.\t]\s*/, '').trim();
            else if (line.match(/^a\.\s*/i)) optionsMap.a = line.replace(/^a\.\s*/i, '').trim();
            else if (line.match(/^b\.\s*/i)) optionsMap.b = line.replace(/^b\.\s*/i, '').trim();
            else if (line.match(/^c\.\s*/i)) optionsMap.c = line.replace(/^c\.\s*/i, '').trim();
            else if (questionText && !line.match(/^[a-c]\.\s*/i)) questionText += " " + line;
        });

        const correctLetter = answerKey[qNum];
        if (!correctLetter || !optionsMap[correctLetter]) {
             console.warn(`Warning: Missing answer for Q#${qNum} in ${qFile}`);
             return;
        }

        finalizedQuestions.push({
            id: `${langPrefix}_${topicName.replace(/\s+/g, '_').toLowerCase()}_${setLabel}_${qNum}`,
            user_type: userType,
            topic: topicName,
            question: questionText,
            options: [optionsMap.a, optionsMap.b, optionsMap.c].filter(Boolean),
            answer: optionsMap[correctLetter]
        });
    });

    saveToJson(outputJsonName, finalizedQuestions, qFile);
}

// Helper to safely write to JSON
function saveToJson(outputJsonName, finalizedQuestions, qFile) {
    const targetPath = path.join('data', outputJsonName);
    let existingData = [];
    if (fs.existsSync(targetPath)) {
        existingData = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
    }

    const combined = [...existingData, ...finalizedQuestions];
    const uniqueDataset = Array.from(new Map(combined.map(item => [item.id, item])).values());

    fs.writeFileSync(targetPath, JSON.stringify(uniqueDataset, null, 2));
    console.log(`Success: Processed ${finalizedQuestions.length} questions from ${qFile}`);
}

// ============================================================================
// EXECUTION BATCHES
// ============================================================================
console.log("Starting full LTO database compilation...");

// 1. Topic Related Exams (Students - Categorized)
compileExamSet('tre_en_setA.txt', 'master_en_setA.txt', 'questions_en.json', 'student', 'en', 'setA');
compileExamSet('tre_en_setB.txt', 'master_en_setB.txt', 'questions_en.json', 'student', 'en', 'setB');
compileExamSet('tre_tg_setA.txt', 'master_tg_setA.txt', 'questions_tl.json', 'student', 'tl', 'setA');
compileExamSet('tre_tg_setB.txt', 'master_tg_setB.txt', 'questions_tl.json', 'student', 'tl', 'setB');

// 2. General Exams (Students - Straight Lists)
// Assuming you have an answer key file for genex, e.g., 'genex_en_ans_setA.txt'
compileStraightList('genex_en_setA.txt', 'genex_en_ans_setA.txt', 'questions_en.json', 'student', 'General Knowledge', 'en', 'gen_setA');
compileStraightList('genex_tg_setA.txt', 'genex_tg_ans_setA.txt', 'questions_tl.json', 'student', 'General Knowledge', 'tl', 'gen_setA');

// 3. Renewal Exams (Drivers - Straight Lists)
compileStraightList('renex_en_setA.txt', 'renex_en_ans_setA.txt', 'questions_en.json', 'driver', 'General Knowledge', 'en', 'ren_setA');
compileStraightList('renex_tg_setA.txt', 'renex_tg_ans_setA.txt', 'questions_tl.json', 'driver', 'General Knowledge', 'tl', 'ren_setA');

console.log("Compilation complete!");