// Loads the real, delivered datasets from /data. Fetched once and cached in memory
// for the life of the page — these files don't change at runtime.

let cache = null;

export async function loadDatasets() {
  if (cache) return cache;
  const [schools, curriculumSubjects, destinationExams] = await Promise.all([
    fetch('data/schools.json').then(r => r.json()),
    fetch('data/curriculum_subjects.json').then(r => r.json()),
    fetch('data/destination_exams.json').then(r => r.json()),
  ]);
  cache = { schools, curriculumSubjects, destinationExams };
  return cache;
}
