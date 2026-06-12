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

/**
 * Smart file finder helper to automatically detect if files are in root or inside /data
 */
function locateFile(fileName) {
    if (fs.existsSync(fileName)) return fileName;
    const pathInData = path.join('data', fileName);
    if (fs.existsSync(pathInData)) return pathInData;
    
    if (!fileName.endsWith('.txt')) {
        if (fs.existsSync(`${fileName}.txt`)) return `${fileName}.txt`;
        if (fs.existsSync(path.join('data', `${fileName}.txt`))) return path.join('data', `${fileName}.txt`);
    }
    return null;
}

/**
 * Global database saver that handles merging and prevents duplicate entries
 */
function saveToDatabase(outputJsonName, newQuestions) {
    const targetPath = fs.existsSync('data') ? path.join('data', outputJsonName) : outputJsonName;
    let existingData = [];
    
    if (fs.existsSync(targetPath)) {
        try {
            existingData = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
        } catch (e) {
            existingData = [];
        }
    }

    const workingDataset = [...existingData, ...newQuestions];
    const uniqueDataset = Array.from(new Map(workingDataset.map(item => [item.id, item])).values());

    fs.writeFileSync(targetPath, JSON.stringify(uniqueDataset, null, 2), 'utf8');
}

// ============================================================================
// TOOL 1: LINE-BY-LINE CATEGORIZED PARSER (For TRE Files with // Headers)
// ============================================================================

function parseTREMasterAnswers(filePath) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const answersBySection = {};
    let currentTopic = "";

    lines.forEach(line => {
        if (line.startsWith('//')) {
            const headingCheck = line.replace(/^\/\//, '').trim().toLowerCase();
            if (CATEGORY_MAP[headingCheck]) {
                currentTopic = CATEGORY_MAP[headingCheck];
                answersBySection[currentTopic] = {};
            }
        } else if (currentTopic) {
            const match = line.match(/^(\d+)\s*[\.:\-)]\s*([a-c])/i);
            if (match) {
                answersBySection[currentTopic][parseInt(match[1])] = match[2].toLowerCase();
            }
        }
    });
    return answersBySection;
}

function compileTRESet(qFile, aFile, outputJson, userType, lang, setLabel) {
    const qPath = locateFile(qFile);
    const aPath = locateFile(aFile);

    if (!qPath || !aPath) {
        console.warn(`[TRE] Skipping missing pair: ${qFile} or ${aFile}`);
        return;
    }

    const qRaw = fs.readFileSync(qPath, 'utf8');
    const masterAnswers = parseTREMasterAnswers(aPath);
    
    // Split the question file cleanly by literal double slashes
    const sections = qRaw.split('//').filter(Boolean);
    const finalizedQuestions = [];

    sections.forEach(section => {
        const lines = section.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (lines.length === 0) return;

        // The first line of this split chunk is always our header topic
        const headingCheck = lines[0].toLowerCase();
        const officialTopic = CATEGORY_MAP[headingCheck];
        if (!officialTopic) return;

        // Split the remaining section chunk into individual question numeric blocks
        const blocks = section.split(/(?=\b\d+[\.\)]\s*)/);
        blocks.forEach(block => {
            const trimmedBlock = block.trim();
            if (!trimmedBlock) return;

            const numMatch = trimmedBlock.match(/^(\d+)[\.\)]\s*/);
            if (!numMatch) return; // Discards the header line block safely
            const qNum = parseInt(numMatch[1]);

            const blockLines = trimmedBlock.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
            let questionText = "";
            let optionsMap = { a: "", b: "", c: "" };

            blockLines.forEach(line => {
                if (line.match(/^\d+[\.\)]\s*/)) {
                    questionText = line.replace(/^\d+[\.\)]\s*/, '').trim();
                } else if (line.match(/^a[\.\)]/i)) {
                    optionsMap.a = line.replace(/^a[\.\)]\s*/i, '').trim();
                } else if (line.match(/^b[\.\)]/i)) {
                    optionsMap.b = line.replace(/^b[\.\)]\s*/i, '').trim();
                } else if (line.match(/^c[\.\)]/i)) {
                    optionsMap.c = line.replace(/^c[\.\)]\s*/i, '').trim();
                } else if (questionText && !line.match(/^[a-c][\.\)]/i)) {
                    questionText += " " + line;
                }
            });

            const correctLetter = masterAnswers[officialTopic]?.[qNum];
            if (!correctLetter || !optionsMap[correctLetter]) return;

            finalizedQuestions.push({
                id: `${lang}_tre_${officialTopic.replace(/\s+/g, '_').toLowerCase()}_${setLabel}_${qNum}`,
                user_type: userType,
                topic: officialTopic,
                question: questionText,
                options: [optionsMap.a, optionsMap.b, optionsMap.c],
                answer: optionsMap[correctLetter]
            });
        });
    });

    saveToDatabase(outputJson, finalizedQuestions);
    console.log(`Successfully parsed TRE Set: ${qFile} -> ${finalizedQuestions.length} questions loaded.`);
}

// ============================================================================
// TOOL 2: STRAIGHT LIST PARSER (For Genex & Renex Files - No Headers)
// ============================================================================

function compileStraightList(qFile, aFile, outputJson, userType, topicName, lang, setLabel) {
    const qPath = locateFile(qFile);
    const aPath = locateFile(aFile);

    if (!qPath || !aPath) {
        console.warn(`[Straight List] Skipping missing pair: ${qFile} or ${aFile}`);
        return;
    }

    const qRaw = fs.readFileSync(qPath, 'utf8');
    const aRaw = fs.readFileSync(aPath, 'utf8');

    const answerKey = {};
    const answerMatches = aRaw.matchAll(/(\d+)\s*[\.:\-)]\s*([a-c])/gi);
    for (const match of answerMatches) {
        answerKey[parseInt(match[1])] = match[2].toLowerCase();
    }

    const finalizedQuestions = [];
    const blocks = qRaw.split(/(?=\b\d+[\.\)]\s+)/);

    blocks.forEach(block => {
        const trimmedBlock = block.trim();
        if (!trimmedBlock) return;

        const numMatch = trimmedBlock.match(/^(\d+)[\.\)]\s*/);
        if (!numMatch) return;
        const qNum = parseInt(numMatch[1]);

        const blockLines = trimmedBlock.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        let questionText = "";
        let optionsMap = { a: "", b: "", c: "" };

        blockLines.forEach(line => {
            if (line.match(/^\d+[\.\)]\s*/)) {
                questionText = line.replace(/^\d+[\.\)]\s*/, '').trim();
            } else if (line.match(/^a[\.\)]/i)) {
                optionsMap.a = line.replace(/^a[\.\)]\s*/i, '').trim();
            } else if (line.match(/^b[\.\)]/i)) {
                optionsMap.b = line.replace(/^b[\.\)]\s*/i, '').trim();
            } else if (line.match(/^c[\.\)]/i)) {
                optionsMap.c = line.replace(/^c[\.\)]\s*/i, '').trim();
            } else if (questionText && !line.match(/^[a-c][\.\)]/i)) {
                questionText += " " + line;
            }
        });

        const correctLetter = answerKey[qNum];
        if (!correctLetter || !optionsMap[correctLetter]) return;

        finalizedQuestions.push({
            id: `${lang}_${setLabel}_${qNum}`,
            user_type: userType,
            topic: topicName,
            question: questionText,
            options: [optionsMap.a, optionsMap.b, optionsMap.c],
            answer: optionsMap[correctLetter]
        });
    });

    saveToDatabase(outputJson, finalizedQuestions);
    console.log(`Successfully parsed List: ${qFile} -> ${finalizedQuestions.length} questions loaded.`);
}

// ============================================================================
// MASTER RUN CONFIGURATION EXECUTION
// ============================================================================
console.log("Initializing LTO Engine Content Core Sync...");

// 1. Process Topic Related Exams (With Category Headers)
compileTRESet('tre_en_setA.txt', 'master_en_setA.txt', 'questions_en.json', 'student', 'en', 'setA');
compileTRESet('tre_en_setB.txt', 'master_en_setB.txt', 'questions_en.json', 'student', 'en', 'setB');
compileTRESet('tre_tg_setA.txt', 'master_tg_setA.txt', 'questions_tl.json', 'student', 'tl', 'setA');
compileTRESet('tre_tg_setB.txt', 'master_tg_setB.txt', 'questions_tl.json', 'student', 'tl', 'setB');

// 2. Process General Student Mock Exams (Straight Continuous Lists)
compileStraightList('genex_en_ques.txt', 'genex_en_ans.txt', 'questions_en.json', 'student', 'General Knowledge', 'en', 'genex_setA');
compileStraightList('genex_tg_ques.txt', 'genex_tg_ans.txt', 'questions_tl.json', 'student', 'General Knowledge', 'tl', 'genex_setA');

// 3. Process Driver Renewal Exams (Straight Continuous Lists)
compileStraightList('renex_en_ques.txt', 'renex_en_ans.txt', 'questions_en.json', 'driver', 'General Knowledge', 'en', 'renex_setA');
compileStraightList('renex_tg_ques.txt', 'renex_tg_ans.txt', 'questions_tl.json', 'driver', 'General Knowledge', 'tl', 'renex_setA');

console.log("Database compilation sync completed successfully.");