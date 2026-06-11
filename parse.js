import fs from 'fs';
import path from 'path';

// Helper function to extract a structured answer key from text file
function parseAnswerKey(filePath, isMasterKey = false) {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    const map = {};

    if (isMasterKey) {
        // Matches headers like "//Road and Traffic Rules" and following number entries
        let currentTopic = "";
        const lines = raw.split('\n').map(l => l.trim());
        lines.forEach(line => {
            if (line.startsWith('//') || line.includes('Road') || line.includes('Principles') || line.includes('Laws') || line.includes('Licensing') || line.includes('Maintenance')) {
                let cleanTopic = line.replace('//', '').trim();
                if (cleanTopic.includes("Signs")) currentTopic = "Road Signs and Pavement Markings";
                else if (cleanTopic.includes("Rules")) currentTopic = "Road and Traffic Rules";
                else if (cleanTopic.includes("Principles")) currentTopic = "Safe Driving Principles";
                else if (cleanTopic.includes("Laws")) currentTopic = "Land Transportation Laws and Violations";
                else if (cleanTopic.includes("Licensing")) currentTopic = "Licensing Information and General Knowledge";
                else if (cleanTopic.includes("Maintenance")) currentTopic = "Vehicle Maintenance and Troubleshooting";
            } else {
                const match = line.match(/^(\d+)\s*\.\s*([a-d])/i);
                if (match && currentTopic) {
                    if (!map[currentTopic]) map[currentTopic] = {};
                    map[currentTopic][parseInt(match[1])] = match[2].toLowerCase();
                }
            }
        });
    } else {
        // Simple sequential format (e.g. "1.b" or "1. B")
        const matches = raw.matchAll(/(\d+)\s*\.\s*([a-d])/gi);
        for (const match of matches) {
            map[parseInt(match[1])] = match[2].toLowerCase();
        }
    }
    return map;
}

// Universal parser block for individual question files
function parseQuestions(qFile, answerMap, outputJsonName, userType, defaultTopic, langPrefix, setLabel = '', isMaster = false) {
    if (!fs.existsSync(qFile) || !answerMap) {
        console.warn(`Skipping: [${qFile}] could not be fully resolved.`);
        return;
    }

    const qRaw = fs.readFileSync(qFile, 'utf8');
    // Splitting blocks safely handling options variation (a., b., c., d. or A., B., C., D.)
    const rawBlocks = qRaw.split(/(?=\b\d+[\.\)]\s+)/);
    const finalizedQuestions = [];
    let currentTopic = defaultTopic;

    rawBlocks.forEach(block => {
        const trimmedBlock = block.trim();
        if (!trimmedBlock) return;

        // Extract local question number
        const numMatch = trimmedBlock.match(/^(\d+)[\.\)]\s+/);
        if (!numMatch) return;
        const qNum = parseInt(numMatch[1]);

        // Check if there's a topic header right before this question inside the file
        if (isMaster) {
            if (trimmedBlock.includes("Signs")) currentTopic = "Road Signs and Pavement Markings";
            else if (trimmedBlock.includes("Rules")) currentTopic = "Road and Traffic Rules";
            else if (trimmedBlock.includes("Principles")) currentTopic = "Safe Driving Principles";
            else if (trimmedBlock.includes("Laws")) currentTopic = "Land Transportation Laws and Violations";
            else if (trimmedBlock.includes("Licensing")) currentTopic = "Licensing Information and General Knowledge";
            else if (trimmedBlock.includes("Maintenance")) currentTopic = "Vehicle Maintenance and Troubleshooting";
        }

        const lines = trimmedBlock.split('\n').map(l => l.trim()).filter(Boolean);
        let questionText = "";
        let optionsMap = { a: "", b: "", c: "", d: "" };

        lines.forEach(line => {
            if (line.match(/^\d+[\.\)]\s+/)) {
                questionText = line.replace(/^\d+[\.\)]\s+/, '').trim();
            } else if (line.match(/^[aA][\.\)]/)) {
                optionsMap.a = line.replace(/^[aA][\.\)]\s*/, '').trim();
            } else if (line.match(/^[bB][\.\)]/)) {
                optionsMap.b = line.replace(/^[bB][\.\)]\s*/, '').trim();
            } else if (line.match(/^[cC][\.\)]/)) {
                optionsMap.c = line.replace(/^[cC][\.\)]\s*/, '').trim();
            } else if (line.match(/^[dD][\.\)]/)) {
                optionsMap.d = line.replace(/^[dD][\.\)]\s*/, '').trim();
            } else if (questionText) {
                questionText += " " + line; // Multi-line text catcher
            }
        });

        // Pull correct answer letter
        let correctLetter = "";
        if (isMaster) {
            correctLetter = answerMap[currentTopic] ? answerMap[currentTopic][qNum] : "";
        } else {
            correctLetter = answerMap[qNum];
        }

        if (!correctLetter || !optionsMap[correctLetter]) {
            return; // Skip invalid or mismatched items
        }

        // Build cleanly structured array entry
        finalizedQuestions.push({
            id: `${langPrefix}_${userType}_${setLabel || 'gen'}_${qNum}_${Math.floor(Math.random() * 1000)}`,
            user_type: userType,
            topic: currentTopic,
            question: questionText,
            options: [optionsMap.a, optionsMap.b, optionsMap.c, optionsMap.d].filter(Boolean),
            answer: optionsMap[correctLetter]
        });
    });

    // Write to destination data JSON file
    const targetPath = path.join('data', outputJsonName);
    let existingData = [];
    if (fs.existsSync(targetPath)) {
        existingData = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
    }

    const combined = [...existingData, ...finalizedQuestions];
    // De-duplication check
    const unique = Array.from(new Map(combined.map(item => [item.question, item])).values());

    fs.writeFileSync(targetPath, JSON.stringify(unique, null, 2));
    console.log(`Successfully imported ${finalizedQuestions.length} items into data/${outputJsonName}`);
}

// === RUN CONVERSIONS ===
console.log("Beginning full database compilation process...");

// Reset targets first to guarantee fresh loads
if (fs.existsSync('data/questions_en.json')) fs.unlinkSync('data/questions_en.json');
if (fs.existsSync('data/questions_tl.json')) fs.unlinkSync('data/questions_tl.json');

// --- 1. TOPIC RELATED EXAMS (STUDENTS) ---
const ansEnA = parseAnswerKey('master_en_setA.txt', true);
parseQuestions('tre_en_setA.txt', ansEnA, 'questions_en.json', 'student', 'Road Signs and Pavement Markings', 'en', 'setA', true);

const ansEnB = parseAnswerKey('master_en_setB.txt', true);
parseQuestions('tre_en_setB.txt', ansEnB, 'questions_en.json', 'student', 'Road Signs and Pavement Markings', 'en', 'setB', true);

const ansTgA = parseAnswerKey('master_tg_setA.txt', true);
parseQuestions('tre_tg_setA.txt', ansTgA, 'questions_tl.json', 'student', 'Road Signs and Pavement Markings', 'tl', 'setA', true);

const ansTgB = parseAnswerKey('master_tg_setB.txt', true);
parseQuestions('tre_tg_setB.txt', ansTgB, 'questions_tl.json', 'student', 'Road Signs and Pavement Markings', 'tl', 'setB', true);


// --- 2. GENERAL STUDENT EXAMS (STUDENTS) ---
const genEnAns = parseAnswerKey('genex_en_ans.txt', false);
parseQuestions('genex_en_ques.txt', genEnAns, 'questions_en.json', 'student', 'General Knowledge', 'en', 'general', false);

const genTgAns = parseAnswerKey('genex_tg_ans.txt', false);
parseQuestions('genex_tg_ques.txt', genTgAns, 'questions_tl.json', 'student', 'General Knowledge', 'tl', 'general', false);


// --- 3. RENEWAL EXAMS (DRIVERS) ---
const renEnAns = parseAnswerKey('renex_en_ans.txt', false);
parseQuestions('renex_en_ques.txt', renEnAns, 'questions_en.json', 'driver', 'General Knowledge', 'en', 'renewal', false);

const renTgAns = parseAnswerKey('renex_tg_ans.txt', false);
parseQuestions('renex_tg_ques.txt', renTgAns, 'questions_tl.json', 'driver', 'General Knowledge', 'tl', 'renewal', false);

console.log("Database parsing execution completed successfully.");