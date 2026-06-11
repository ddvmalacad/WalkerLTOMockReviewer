import fs from 'fs';
import path from 'path';

// Robust Answer Key Parser
function parseAnswerKey(filePath, isMasterKey = false) {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    const map = {};

    if (isMasterKey) {
        let currentTopic = "";
        const lines = raw.split('\n').map(l => l.trim());
        lines.forEach(line => {
            if (line.startsWith('//') || (!line.match(/^\d+/) && line.length > 5)) {
                let cleanTopic = line.replace('//', '').trim();
                if (cleanTopic.toLowerCase().includes("signs")) currentTopic = "Road Signs and Pavement Markings";
                else if (cleanTopic.toLowerCase().includes("rules")) currentTopic = "Road and Traffic Rules";
                else if (cleanTopic.toLowerCase().includes("principles")) currentTopic = "Safe Driving Principles";
                else if (cleanTopic.toLowerCase().includes("laws")) currentTopic = "Land Transportation Laws and Violations";
                else if (cleanTopic.toLowerCase().includes("licensing")) currentTopic = "Licensing Information and General Knowledge";
                else if (cleanTopic.toLowerCase().includes("maintenance")) currentTopic = "Vehicle Maintenance and Troubleshooting";
            } else {
                const match = line.match(/^(\d+)\s*[\.\:]\s*([a-d])/i);
                if (match && currentTopic) {
                    if (!map[currentTopic]) map[currentTopic] = {};
                    map[currentTopic][parseInt(match[1])] = match[2].toLowerCase();
                }
            }
        });
    } else {
        const matches = raw.matchAll(/(\d+)\s*[\.\:]\s*([a-d])/gi);
        for (const match of matches) {
            map[parseInt(match[1])] = match[2].toLowerCase();
        }
    }
    return map;
}

// Universal Question Parser
function parseQuestions(qFile, answerMap, outputJsonName, userType, defaultTopic, langPrefix, setLabel = '', isMaster = false) {
    if (!fs.existsSync(qFile) || !answerMap) {
        console.warn(`Skipping: [${qFile}] could not be fully resolved.`);
        return;
    }

    const qRaw = fs.readFileSync(qFile, 'utf8');
    // Splitting blocks safely handling normal dots, parentheses, and tabs
    const rawBlocks = qRaw.split(/(?=\b\d+[\.\)\t]\s*)/);
    const finalizedQuestions = [];
    let currentTopic = defaultTopic;

    rawBlocks.forEach(block => {
        const trimmedBlock = block.trim();
        if (!trimmedBlock) return;

        const numMatch = trimmedBlock.match(/^(\d+)[\.\)\t]\s*/);
        if (!numMatch) return;
        const qNum = parseInt(numMatch[1]);

        if (isMaster) {
            if (trimmedBlock.toLowerCase().includes("signs")) currentTopic = "Road Signs and Pavement Markings";
            else if (trimmedBlock.toLowerCase().includes("rules")) currentTopic = "Road and Traffic Rules";
            else if (trimmedBlock.toLowerCase().includes("principles")) currentTopic = "Safe Driving Principles";
            else if (trimmedBlock.toLowerCase().includes("laws")) currentTopic = "Land Transportation Laws and Violations";
            else if (trimmedBlock.toLowerCase().includes("licensing")) currentTopic = "Licensing Information and General Knowledge";
            else if (trimmedBlock.toLowerCase().includes("maintenance")) currentTopic = "Vehicle Maintenance and Troubleshooting";
        }

        const lines = trimmedBlock.split('\n').map(l => l.trim()).filter(Boolean);
        let questionText = "";
        let optionsMap = { a: "", b: "", c: "", d: "" };

        lines.forEach(line => {
            if (line.match(/^\d+[\.\)\t]\s*/)) {
                questionText = line.replace(/^\d+[\.\)\t]\s*/, '').trim();
            } else if (line.match(/^[aA][\.\)\t]/)) {
                optionsMap.a = line.replace(/^[aA][\.\)\t]\s*/, '').trim();
            } else if (line.match(/^[bB][\.\)\t]/)) {
                optionsMap.b = line.replace(/^[bB][\.\)\t]\s*/, '').trim();
            } else if (line.match(/^[cC][\.\)\t]/)) {
                optionsMap.c = line.replace(/^[cC][\.\)\t]\s*/, '').trim();
            } else if (line.match(/^[dD][\.\)\t]/)) {
                optionsMap.d = line.replace(/^[dD][\.\)\t]\s*/, '').trim();
            } else if (questionText && !line.startsWith('//')) {
                questionText += " " + line; 
            }
        });

        let correctLetter = isMaster ? (answerMap[currentTopic] ? answerMap[currentTopic][qNum] : "") : answerMap[qNum];

        if (!correctLetter || !optionsMap[correctLetter]) return;

        finalizedQuestions.push({
            id: `${langPrefix}_${userType}_${setLabel || 'gen'}_${qNum}_${Math.floor(Math.random() * 10000)}`,
            user_type: userType,
            topic: currentTopic,
            question: questionText,
            options: [optionsMap.a, optionsMap.b, optionsMap.c, optionsMap.d].filter(Boolean),
            answer: optionsMap[correctLetter]
        });
    });

    const targetPath = path.join('data', outputJsonName);
    let existingData = [];
    if (fs.existsSync(targetPath)) {
        existingData = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
    }

    const combined = [...existingData, ...finalizedQuestions];
    const unique = Array.from(new Map(combined.map(item => [item.question, item])).values());

    fs.writeFileSync(targetPath, JSON.stringify(unique, null, 2));
    console.log(`--> Successfully imported ${finalizedQuestions.length} items from ${qFile} into data/${outputJsonName}`);
}

// === RUN CONVERSIONS ===
console.log("Beginning full database compilation process...");

if (!fs.existsSync('data')) fs.mkdirSync('data');
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