// One-off generator for data/question_bank.json's padded placeholder set
// (Phase 2, PLAN.md). Not run automatically — re-run manually if the curated
// content below changes: `node scripts/gen-question-bank.js`. All content is
// explicitly placeholder (see each question's `reviewed_by: null` and the
// file's own `purpose` string) pending Abhi's real bank (session_handoff.md
// item K, still outstanding).
'use strict';
const fs = require('fs');
const path = require('path');

let seq = 0;
function q(curriculum, eligibleStreamIds, subject, difficulty, topic, question, options, answer, explanation) {
  seq++;
  if (!options.includes(answer)) throw new Error(`answer not in options: ${question}`);
  if (new Set(options).size !== options.length) throw new Error(`duplicate options: ${question}`);
  return {
    id: `ph-${curriculum.toLowerCase().replace(/\s+/g, '')}-${seq.toString().padStart(3, '0')}`,
    curriculum,
    eligible_stream_ids: eligibleStreamIds,
    subject,
    difficulty,
    topic,
    language: 'en',
    q: question,
    options,
    answer,
    explanation,
    reviewed_by: null,
    placeholder: true,
  };
}

const questions = [
  // ===== Indian / CBSE =====
  q('Indian', ['science-pcm', 'science-pcmb'], 'Physics', 'easy', 'Units', 'What is the SI unit of force?', ['Newton', 'Joule', 'Watt', 'Pascal'], 'Newton', 'Force is measured in newtons (N).'),
  q('Indian', ['science-pcm'], 'Mathematics', 'medium', 'Trigonometry', 'What is the value of sin(90°)?', ['0', '0.5', '1', 'Undefined'], '1', 'sin(90°) = 1.'),
  q('Indian', ['science-pcb', 'science-pcmb'], 'Biology', 'easy', 'Cell biology', 'Which organelle is known as the powerhouse of the cell?', ['Mitochondria', 'Nucleus', 'Ribosome', 'Golgi apparatus'], 'Mitochondria', 'Mitochondria generate most of the cell’s ATP.'),
  q('Indian', ['science-pcb'], 'Chemistry', 'medium', 'Periodic table', 'What is the chemical symbol for Sodium?', ['Na', 'S', 'So', 'N'], 'Na', 'Sodium’s symbol comes from its Latin name, natrium.'),
  q('Indian', ['science-pcmb'], 'Physics', 'medium', 'Kinematics', 'A car accelerates from rest at 2 m/s² for 5 seconds. What is its final speed?', ['5 m/s', '10 m/s', '15 m/s', '20 m/s'], '10 m/s', 'v = u + at = 0 + 2×5 = 10 m/s.'),
  q('Indian', ['commerce-with-maths', 'commerce-without-maths'], 'Business Studies', 'easy', 'Costs', "Which of these is a fixed cost for a business?", ['Rent', 'Raw materials', 'Sales commission', 'Packaging'], 'Rent', 'Fixed costs don’t change with output — rent is paid regardless of sales volume.'),
  q('Indian', ['commerce-with-maths'], 'Mathematics', 'medium', 'Interest', 'What is the simple interest on AED 1000 at 5% per annum for 2 years?', ['AED 50', 'AED 100', 'AED 150', 'AED 200'], 'AED 100', 'SI = P×R×T/100 = 1000×5×2/100 = 100.'),
  q('Indian', ['commerce-without-maths'], 'Economics', 'easy', 'Macroeconomics', "What term describes the total value of goods and services produced in a country in a year?", ['GDP', 'GST', 'ROI', 'EPS'], 'GDP', 'GDP stands for Gross Domestic Product.'),
  q('Indian', ['commerce-with-maths', 'commerce-without-maths'], 'Accountancy', 'medium', 'Assets', 'A long-term asset a business owns and uses, like a building, is called a:', ['Fixed asset', 'Current asset', 'Liability', 'Expense'], 'Fixed asset', 'Fixed assets are held for long-term use, not resale.'),
  q('Indian', ['humanities'], 'History', 'easy', 'Ancient world', 'Which ancient wonder was located in Giza, Egypt?', ['The Great Pyramid', 'The Colosseum', 'The Hanging Gardens', 'The Great Wall'], 'The Great Pyramid', 'The Great Pyramid of Giza is one of the Seven Wonders of the Ancient World.'),
  q('Indian', ['humanities'], 'Geography', 'medium', 'Physical geography', 'Which is the longest river in the world?', ['Nile', 'Amazon', 'Yangtze', 'Mississippi'], 'Nile', 'The Nile is generally cited as the world’s longest river.'),

  // ===== IB =====
  q('IB', ['group1'], 'English', 'easy', 'Literature', "Who wrote 'Romeo and Juliet'?", ['William Shakespeare', 'Charles Dickens', 'Mark Twain', 'Jane Austen'], 'William Shakespeare', 'Shakespeare wrote the play around 1595.'),
  q('IB', ['group1'], 'English', 'medium', 'Literary devices', "What literary device compares two things using 'like' or 'as'?", ['Simile', 'Metaphor', 'Alliteration', 'Hyperbole'], 'Simile', 'A simile makes an explicit comparison using ‘like’ or ‘as’.'),
  q('IB', ['group2'], 'Language Acquisition', 'easy', 'French basics', "In French, 'bonjour' means:", ['Hello', 'Goodbye', 'Thank you', 'Please'], 'Hello', "'Bonjour' is a standard daytime greeting."),
  q('IB', ['group2'], 'Language Acquisition', 'medium', 'World languages', 'Which language uses the Cyrillic alphabet?', ['Russian', 'French', 'Spanish', 'German'], 'Russian', 'Russian is written using the Cyrillic script.'),
  q('IB', ['group3'], 'Economics', 'easy', 'Market structures', 'What is the term for a market with only one seller?', ['Monopoly', 'Oligopoly', 'Duopoly', 'Perfect competition'], 'Monopoly', 'A monopoly exists when a single seller dominates a market.'),
  q('IB', ['group3'], 'History', 'medium', '20th century', 'In which year did World War II end?', ['1945', '1939', '1918', '1950'], '1945', 'WWII ended in 1945.'),
  q('IB', ['group4'], 'Biology', 'easy', 'Cells', 'Which structure controls movement of substances into and out of a cell?', ['Cell membrane', 'Nucleus', 'Ribosome', 'Chromosome'], 'Cell membrane', "The membrane selectively controls exchange with the cell's environment."),
  q('IB', ['group4'], 'Physics', 'medium', 'Mechanics', 'What is the acceleration due to gravity on Earth (approx.)?', ['9.8 m/s²', '8.9 m/s²', '10.8 m/s²', '6.7 m/s²'], '9.8 m/s²', 'Standard gravity is approximately 9.8 m/s².'),
  q('IB', ['group5'], 'Mathematics', 'easy', 'Constants', 'What is the value of π rounded to two decimal places?', ['3.14', '3.41', '3.12', '3.16'], '3.14', 'π ≈ 3.14159…'),
  q('IB', ['group5'], 'Mathematics', 'medium', 'Algebra', 'Solve for x: 2x + 3 = 11', ['4', '5', '3', '6'], '4', '2x = 8, so x = 4.'),
  q('IB', ['group6'], 'The Arts', 'easy', 'Art movements', 'Which art movement is Pablo Picasso most associated with?', ['Cubism', 'Impressionism', 'Surrealism', 'Baroque'], 'Cubism', 'Picasso co-founded Cubism in the early 20th century.'),
  q('IB', ['group6'], 'The Arts', 'medium', 'Music notation', "In music, what does 'forte' indicate?", ['Loud', 'Soft', 'Fast', 'Slow'], 'Loud', "'Forte' is an Italian musical term meaning loud."),

  // ===== British (A-Level combination clusters) =====
  q('British', ['engineering'], 'Physics', 'easy', 'Electricity', 'What is the unit of electrical resistance?', ['Ohm', 'Volt', 'Ampere', 'Watt'], 'Ohm', 'Resistance is measured in ohms (Ω).'),
  q('British', ['engineering'], 'Mathematics', 'medium', 'Calculus', 'What is the derivative of x²?', ['2x', 'x', 'x²', '2'], '2x', 'd/dx(x²) = 2x.'),
  q('British', ['medicine'], 'Biology', 'easy', 'Human biology', 'What is the normal resting heart rate range for a healthy adult (bpm)?', ['60-100', '20-40', '150-180', '100-140'], '60-100', 'A healthy adult resting heart rate is typically 60-100 bpm.'),
  q('British', ['medicine'], 'Chemistry', 'medium', 'Acids and bases', 'What is the pH of pure water?', ['7', '1', '14', '0'], '7', 'Pure water is neutral, pH 7.'),
  q('British', ['business'], 'Economics', 'easy', 'Macroeconomics', "What does 'GDP' stand for?", ['Gross Domestic Product', 'General Domestic Profit', 'Gross Debt Product', 'General Development Plan'], 'Gross Domestic Product', 'GDP measures a country’s total economic output.'),
  q('British', ['business'], 'Business Studies', 'medium', 'Financial statements', "What is a common term for a company's income minus its expenses?", ['Profit', 'Revenue', 'Turnover', 'Capital'], 'Profit', 'Profit = revenue - expenses.'),
  q('British', ['law'], 'History', 'easy', 'Legal history', 'The Magna Carta was signed in which country?', ['England', 'France', 'Germany', 'Italy'], 'England', 'The Magna Carta was signed in England in 1215.'),
  q('British', ['law'], 'English Literature', 'medium', 'Modern novels', "Which author wrote '1984'?", ['George Orwell', 'Aldous Huxley', 'Ray Bradbury', 'H.G. Wells'], 'George Orwell', 'George Orwell published ‘1984’ in 1949.'),
  q('British', ['arts_humanities'], 'Art and Design', 'easy', 'Renaissance art', 'Leonardo da Vinci painted which famous portrait?', ['Mona Lisa', 'The Scream', 'Starry Night', 'Guernica'], 'Mona Lisa', 'The Mona Lisa is housed in the Louvre.'),
  q('British', ['arts_humanities'], 'History', 'medium', 'UK history', 'Who was the first Prime Minister of the United Kingdom?', ['Robert Walpole', 'Winston Churchill', 'Margaret Thatcher', 'Tony Blair'], 'Robert Walpole', 'Robert Walpole is widely considered the first PM, from 1721.'),

  // ===== American (AP categories) =====
  q('American', ['capstone'], 'English', 'easy', 'AP Capstone', 'AP Seminar and AP Research together make up which AP program?', ['AP Capstone', 'AP Core', 'AP Foundation', 'AP Honors'], 'AP Capstone', 'AP Capstone is a two-course sequence: Seminar and Research.'),
  q('American', ['capstone'], 'Research skills', 'medium', 'Research methods', 'Which skill is central to AP Research?', ['Independent investigation', 'Memorization', 'Group singing', 'Sports strategy'], 'Independent investigation', 'AP Research centers on an independent, evidence-based research project.'),
  q('American', ['arts'], 'Art History', 'easy', 'Renaissance art', 'Who painted the ceiling of the Sistine Chapel?', ['Michelangelo', 'Leonardo da Vinci', 'Raphael', 'Donatello'], 'Michelangelo', 'Michelangelo painted the ceiling between 1508-1512.'),
  q('American', ['arts'], 'Music Theory', 'medium', 'Fundamentals', 'Music theory studies the structure of:', ['Music', 'Language', 'Chemistry', 'Geography'], 'Music', 'Music theory analyzes the elements and structure of music.'),
  q('American', ['english'], 'English', 'easy', 'American literature', "Who wrote 'To Kill a Mockingbird'?", ['Harper Lee', 'Mark Twain', 'F. Scott Fitzgerald', 'Ernest Hemingway'], 'Harper Lee', 'Harper Lee published the novel in 1960.'),
  q('American', ['english'], 'English', 'medium', 'Literary devices', "What is a 'metaphor'?", ['A direct comparison without like/as', 'A question', 'A rhyme', 'A summary'], 'A direct comparison without like/as', 'A metaphor states one thing is another, without ‘like’ or ‘as’.'),
  q('American', ['history_social_science'], 'US History', 'easy', 'Founding era', 'In which year did the US declare independence?', ['1776', '1789', '1812', '1865'], '1776', 'The Declaration of Independence was adopted in 1776.'),
  q('American', ['history_social_science'], 'Macroeconomics', 'medium', 'Indicators', 'What economic indicator measures inflation using a fixed basket of goods?', ['CPI', 'GDP', 'ROI', 'EPS'], 'CPI', 'The Consumer Price Index (CPI) tracks price changes for a fixed basket of goods.'),
  q('American', ['math_cs'], 'Mathematics', 'easy', 'Arithmetic', 'What is 7 squared?', ['49', '42', '56', '63'], '49', '7×7 = 49.'),
  q('American', ['math_cs'], 'Computer Science', 'medium', 'Hardware basics', "In computing, what does 'CPU' stand for?", ['Central Processing Unit', 'Computer Personal Unit', 'Central Program Utility', 'Core Processing Utility'], 'Central Processing Unit', 'The CPU is the primary processor of a computer.'),
  q('American', ['sciences'], 'Earth Science', 'easy', 'Solar system', 'What planet is known as the Red Planet?', ['Mars', 'Venus', 'Jupiter', 'Mercury'], 'Mars', 'Mars appears red due to iron oxide on its surface.'),
  q('American', ['sciences'], 'Chemistry', 'medium', 'Periodic table', 'What is the atomic number of Hydrogen?', ['1', '2', '6', '8'], '1', 'Hydrogen has 1 proton, so its atomic number is 1.'),
  q('American', ['world_languages'], 'World Languages', 'easy', 'French basics', "'Merci' is a French word meaning:", ['Thank you', 'Hello', 'Goodbye', 'Please'], 'Thank you', "'Merci' is French for thank you."),
  q('American', ['world_languages'], 'World Languages', 'medium', 'Language & culture', 'Which language is primarily spoken in Brazil?', ['Portuguese', 'Spanish', 'French', 'Italian'], 'Portuguese', 'Brazil is a former Portuguese colony and speaks Portuguese.'),

  // ===== UAE MoE (post-2023 reform streams) =====
  q('UAE MoE', ['general', 'advanced', 'professional', 'elite'], 'Social Studies', 'easy', 'UAE facts', 'What is the capital of the UAE?', ['Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman'], 'Abu Dhabi', 'Abu Dhabi is the capital of the UAE.'),
  q('UAE MoE', ['general', 'advanced', 'professional', 'elite'], 'Social Studies', 'medium', 'UAE history', 'The UAE was formed in which year?', ['1971', '1961', '1981', '1991'], '1971', 'The UAE was formed in 1971.'),
  q('UAE MoE', ['advanced', 'elite'], 'Physics', 'easy', 'Thermal physics', 'What is the freezing point of water in Celsius?', ['0°C', '100°C', '-10°C', '32°C'], '0°C', 'Water freezes at 0°C at standard pressure.'),
  q('UAE MoE', ['advanced', 'elite'], 'Mathematics', 'medium', 'Roots', 'What is the square root of 144?', ['12', '14', '11', '13'], '12', '12×12 = 144.'),
  q('UAE MoE', ['professional'], 'Applied Skills', 'easy', 'Vocational training', 'Which of these is a vocational/technical skill area?', ['Electrical wiring', 'Literary analysis', 'Calculus', 'Astrophysics'], 'Electrical wiring', 'Electrical wiring is a hands-on technical trade skill.'),
  q('UAE MoE', ['professional'], 'Applied Skills', 'medium', 'Vocational training', 'Vocational programs typically emphasize:', ['Practical/applied skills', 'Pure theory only', 'Foreign language only', 'None of these'], 'Practical/applied skills', 'Vocational streams emphasize practical, applied learning.'),
  q('UAE MoE', ['elite'], 'Chemistry', 'easy', 'Formulas', 'What is the chemical formula for water?', ['H2O', 'CO2', 'O2', 'H2'], 'H2O', 'Water is two hydrogen atoms bonded to one oxygen atom.'),
  q('UAE MoE', ['elite'], 'Mathematics', 'medium', 'Percentages', 'What is 15% of 200?', ['30', '20', '15', '25'], '30', '15% of 200 = 0.15×200 = 30.'),

  // ===== SABIS (exam-track-aligned; applies broadly, no specific track data) =====
  q('SABIS', [], 'Reasoning', 'easy', 'Number patterns', 'Complete the sequence: 2, 4, 8, 16, ...?', ['32', '24', '30', '20'], '32', 'Each term doubles the previous one.'),
  q('SABIS', [], 'Mathematics', 'medium', 'Rates', 'If a train travels 60 km in 1.5 hours, its average speed is:', ['40 km/h', '45 km/h', '50 km/h', '35 km/h'], '40 km/h', 'Speed = distance / time = 60 / 1.5 = 40 km/h.'),

  // ===== Other (generic, no stream structure) =====
  q('Other', [], 'Reasoning', 'easy', 'Number patterns', 'Which number does not belong: 3, 5, 9, 11, 13?', ['9', '11', '13', '5'], '9', '9 is the only composite (non-prime) number in the list.'),
  q('Other', [], 'Reasoning', 'medium', 'Days of the week', 'If today is Monday, what day will it be after 10 days?', ['Thursday', 'Wednesday', 'Friday', 'Tuesday'], 'Thursday', '10 days from Monday: 7 days brings you back to Monday, +3 more days is Thursday.'),
];

const bank = {
  schema: 'pedagogy.question-bank.v1',
  purpose: "Academic quiz question bank for the Sharjah Expo app. STUB DATA ONLY — Abhi has not yet delivered the real bank (target ~50-70 questions per subject per difficulty tier per curriculum, per CLAUDE.md/session_handoff.md Section 3K). Padded 2026-09-20 (Phase 2) from 4 questions to a small real spread across every curriculum/stream so the eligibility-filtering flow is actually testable end to end — every question below is still placeholder content (`placeholder: true`, `reviewed_by: null`), not reviewed by Abhi, and gets swapped when the real bank lands. Generated by scripts/gen-question-bank.js — edit the curated content there, not this file directly.",
  note_on_stream_ids: "eligible_stream_ids values must match an 'id' inside data/curriculum_subjects.json's curricula[curriculum].streams[].id / .groups[].id / .combination_clusters[].id / .ap_categories[].id, or a synthetic 'track-N' id for .external_exam_tracks (see js/questions.js's getStreamOptions, the single canonical derivation both the registration stream-picker and this validator use). An empty array means the question applies to every stream/group/cluster within that curriculum. Curricula with no stream/group structure (SABIS and the 'Other' bucket) should always use an empty array here.",
  questions,
};

const outPath = path.join(__dirname, '..', 'data', 'question_bank.json');
fs.writeFileSync(outPath, JSON.stringify(bank, null, 2) + '\n');
console.log(`Wrote ${questions.length} questions to ${outPath}`);
