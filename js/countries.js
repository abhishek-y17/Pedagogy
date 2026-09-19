// Classic script. Static world-country list for the destinations step's "Other"
// search overlay (session_handoff.md Section 3A). This is generic reference
// data (common English country names), not something requiring Abhi's input —
// no delivered dataset covers "every country in the world" and none is needed;
// this is the kind of list every geography/country picker ships with.
// The 9 named countries + "Other" chip grid itself uses data/destination_exams.json's
// own keys as the source of truth (js/destinations.js), not this list.
(function () {
  'use strict';
  window.PED = window.PED || {};
  window.PED.COUNTRIES = [
    'Afghanistan', 'Albania', 'Algeria', 'Argentina', 'Armenia', 'Austria', 'Azerbaijan',
    'Bahrain', 'Bangladesh', 'Belarus', 'Belgium', 'Bhutan', 'Bosnia and Herzegovina', 'Brazil',
    'Brunei', 'Bulgaria', 'Cambodia', 'Cameroon', 'Chile', 'China', 'Colombia', 'Croatia',
    'Cyprus', 'Czechia', 'Denmark', 'Egypt', 'Estonia', 'Ethiopia', 'Fiji', 'Finland', 'France',
    'Georgia', 'Germany', 'Ghana', 'Greece', 'Hong Kong', 'Hungary', 'Iceland', 'Indonesia',
    'Iran', 'Iraq', 'Israel', 'Italy', 'Ivory Coast', 'Jamaica', 'Japan', 'Jordan', 'Kazakhstan',
    'Kenya', 'Kuwait', 'Kyrgyzstan', 'Latvia', 'Lebanon', 'Libya', 'Liechtenstein', 'Lithuania',
    'Luxembourg', 'Malaysia', 'Maldives', 'Malta', 'Mauritius', 'Mexico', 'Moldova', 'Monaco',
    'Mongolia', 'Montenegro', 'Morocco', 'Myanmar', 'Nepal', 'Netherlands', 'New Zealand',
    'Nigeria', 'North Macedonia', 'Norway', 'Oman', 'Pakistan', 'Palestine', 'Panama',
    'Papua New Guinea', 'Peru', 'Philippines', 'Poland', 'Portugal', 'Qatar', 'Romania',
    'Russia', 'Rwanda', 'Saudi Arabia', 'Serbia', 'Seychelles', 'Slovakia', 'Slovenia',
    'South Africa', 'South Korea', 'Spain', 'Sri Lanka', 'Sudan', 'Sweden', 'Switzerland',
    'Syria', 'Taiwan', 'Tajikistan', 'Tanzania', 'Thailand', 'Tunisia', 'Turkey', 'Turkmenistan',
    'Uganda', 'Ukraine', 'Uzbekistan', 'Vietnam', 'Yemen', 'Zambia', 'Zimbabwe',
  ].sort();
})();
