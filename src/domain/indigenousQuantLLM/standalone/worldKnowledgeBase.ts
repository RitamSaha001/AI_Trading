/**
 * LUMEN ASTRA: ENCYCLOPEDIC WORLD KNOWLEDGE & SECTOR SPECIALIZATION BASE
 * 
 * Comprehensive structured knowledge dossiers across:
 * 1. World Geography, Capitals, Borders & Geopolitical Dynamics
 * 2. Wars, Conflicts, Military Strategy & Defense Doctrines
 * 3. Five Core Macro Pillars (Equities, Trade, Central Banks, Defense, Energy/Oil)
 * 4. Foundational Sciences, Mathematics & Artificial Intelligence
 * 5. Philosophy, Ethics, Psychology & Natural Conversational Dialogue
 */

export interface CountryDossier {
  name: string;
  aliases: string[];
  continent: string;
  capital: string;
  borders: string[];
  geography: string;
  strategicSignificance: string;
  economicPillars: string;
  contemporaryContext: string;
}

export interface ConflictDossier {
  name: string;
  aliases: string[];
  theater: string;
  era: string;
  belligerents: string;
  strategicCauses: string;
  tacticsAndTechnology: string;
  geopoliticalRepercussions: string;
  humanitarianAndEconomicImpact: string;
}

export interface MacroSectorDossier {
  pillar: 'STOCKS' | 'COMMERCE' | 'CENTRAL_BANKS' | 'DEFENSE' | 'COMMODITIES';
  title: string;
  aliases: string[];
  coreMechanisms: string;
  transmissionChannels: string;
  keyInstitutionsAndAssets: string;
  strategicRisks: string;
}

// --------------------------------------------------------------------------
// 1. COMPREHENSIVE WORLD GEOGRAPHY & NATIONS DOSSIERS
// --------------------------------------------------------------------------
export const COUNTRY_DOSSIERS: CountryDossier[] = [
  {
    name: 'Ukraine',
    aliases: ['ukraine', 'kyiv', 'kiev', 'crimea', 'donbas', 'zelensky', 'kharkiv', 'odessa'],
    continent: 'Eastern Europe',
    capital: 'Kyiv (situated along the Dnipro River)',
    borders: ['Russia (east/northeast)', 'Belarus (north)', 'Poland, Slovakia, Hungary (west)', 'Romania, Moldova (southwest)', 'Black Sea & Sea of Azov (south)'],
    geography: 'Second-largest European country by landmass (~603,628 km²). Dominated by fertile agricultural plains (chernozem black soil), crossed by the Dnipro, Dniester, and Southern Bug rivers, with the Carpathian Mountains in the far west.',
    strategicSignificance: 'Acts as the strategic territorial and cultural threshold between Western Europe/NATO and the Eurasian heartland. Controls critical Black Sea maritime transit routes and Eurasian natural gas pipeline corridors.',
    economicPillars: 'Renowned as the "Breadbasket of Europe"—global exporter of wheat, corn, barley, and sunflower oil; significant reserves of iron ore, titanium, and coal; robust aerospace (Antonov) and software engineering sectors.',
    contemporaryContext: 'Subject of Russia\'s full-scale invasion in February 2022 (following the 2014 annexation of Crimea and Donbas war). The ongoing conflict has transformed global defense architecture, accelerated European defense integration, expanded NATO to Finland and Sweden, and disrupted global agricultural supply chains.',
  },
  {
    name: 'Russia',
    aliases: ['russia', 'russian federation', 'moscow', 'putin', 'kremlin', 'siberia'],
    continent: 'Eurasia (Eastern Europe & Northern Asia)',
    capital: 'Moscow',
    borders: ['Norway, Finland, Estonia, Latvia, Lithuania, Poland (via Kaliningrad), Belarus, Ukraine, Georgia, Azerbaijan, Kazakhstan, China, Mongolia, North Korea'],
    geography: 'Largest country in the world by area (>17 million km²), spanning 11 time zones from the Baltic Sea to the Pacific Ocean. Features vast Siberian taiga, tundra, the Ural Mountains dividing Europe and Asia, and extensive Arctic coastlines.',
    strategicSignificance: 'Possesses the world\'s largest nuclear arsenal; permanent UN Security Council veto member; dominates Eurasian energy transit corridors and the emerging Northern Sea Route through melting Arctic ice.',
    economicPillars: 'Energy superpower (major producer of crude oil, natural gas, and coal); leading exporter of wheat, nickel, palladium, enriched uranium, and potash fertilizers; substantial state-directed defense manufacturing.',
    contemporaryContext: 'Currently engaged in high-intensity war in Ukraine, subject to unprecedented Western sanctions, asset freezes, and export controls. Has strategically pivoted its trade toward China, India, Iran, and the Global South under BRICS+ alignment.',
  },
  {
    name: 'United States of America',
    aliases: ['united states', 'usa', 'america', 'washington', 'us', 'pentagon', 'white house'],
    continent: 'North America',
    capital: 'Washington, D.C.',
    borders: ['Canada (north)', 'Mexico (south)', 'Atlantic Ocean (east)', 'Pacific Ocean (west)', 'Arctic Ocean (Alaska)'],
    geography: 'Third-largest country by area (~9.83 million km²). Diverse biomes ranging from eastern temperate forests and Great Plains to Rocky Mountains, Mojave desert, and Pacific coastline.',
    strategicSignificance: 'Preeminent global superpower: maintains global network of bilateral and multilateral military alliances (NATO, AUKUS, Quad); issues the US Dollar (the world\'s primary reserve and trade invoicing currency); commands global blue-water naval power.',
    economicPillars: 'World\'s largest national economy (~$28T nominal GDP); undisputed global leader in artificial intelligence, software, aerospace, semiconductors, medical biotechnology, and advanced financial capital markets.',
    contemporaryContext: 'Navigating strategic competition with China, supporting allies in Europe and Indo-Pacific, managing industrial re-shoring (CHIPS Act, Inflation Reduction Act), and balancing monetary tightening with massive sovereign debt servicing.',
  },
  {
    name: 'China',
    aliases: ['china', 'prc', 'beijing', 'xi jinping', 'chinese', 'shanghai', 'taiwan strait'],
    continent: 'East Asia',
    capital: 'Beijing',
    borders: ['14 land neighbors including Russia, India, Pakistan, Kazakhstan, Mongolia, Vietnam, North Korea, Myanmar'],
    geography: 'Third/fourth largest country by area (~9.6 million km²). Mountainous western plateau (Tibet/Himalayas), Gobi desert, and fertile eastern river basins (Yangtze, Yellow River) hosting over 1.4 billion people.',
    strategicSignificance: 'Second-largest global economy and primary manufacturer of the physical world. Expanding military power in the Indo-Pacific, pursuing Belt and Road Initiative (BRI) infrastructure, and challenging US maritime access along the First Island Chain.',
    economicPillars: 'The world\'s manufacturing hub; dominant global supplier of solar panels, electric vehicles (EVs), lithium batteries, consumer electronics, and refined rare earth elements.',
    contemporaryContext: 'Focusing on technological self-reliance (indigenous semiconductor lithography), managing domestic real estate restructuring and demographic transition, and asserting sovereignty claims over Taiwan and the South China Sea.',
  },
  {
    name: 'India',
    aliases: ['india', 'bharat', 'new delhi', 'delhi', 'modi', 'mumbai', 'indian'],
    continent: 'South Asia',
    capital: 'New Delhi',
    borders: ['Pakistan (west)', 'China, Nepal, Bhutan (north)', 'Bangladesh, Myanmar (east)', 'Indian Ocean, Arabian Sea, Bay of Bengal (south)'],
    geography: 'Seventh-largest country (~3.29 million km²). Guarded by the towering Himalayan range in the north, fertile Indo-Gangetic plains, Deccan plateau, and an extensive 7,516 km maritime coastline along vital Indian Ocean trade lanes.',
    strategicSignificance: 'World\'s most populous nation (~1.43B citizens) and world\'s largest democracy. Sits at the fulcrum of Indo-Pacific trade; key anchor of the Quad; non-aligned strategic autonomy bridging Western partnerships and Global South leadership.',
    economicPillars: 'Fifth-largest and fastest-growing major global economy (~$4T); premier global exporter of information technology services, software, and pharmaceuticals ("pharmacy of the world"); expanding domestic manufacturing via Production Linked Incentives (PLI) in electronics, defense, and automotive.',
    contemporaryContext: 'Accelerating indigenous defense manufacturing (Make in India for HAL, BEL, BDL), executing massive physical and digital public infrastructure expansions (UPI, high-speed rail, multi-modal logistics), and navigating Himalayan border tensions with China.',
  },
  {
    name: 'Taiwan',
    aliases: ['taiwan', 'taipei', 'tsmc', 'taiwan strait', 'formosa'],
    continent: 'East Asia',
    capital: 'Taipei',
    borders: ['East China Sea (north)', 'Philippine Sea (east)', 'South China Sea (south)', 'Taiwan Strait separating it from mainland China (west)'],
    geography: 'Rugged island (~36,193 km²) dominated by the Central Mountain Range with densely populated western coastal plains.',
    strategicSignificance: 'Key node of the First Island Chain controlling vital maritime transit in East Asia. Hosts a "Silicon Shield" producing over 60% of the world\'s semiconductors and over 90% of sub-5nm advanced microchips (TSMC), making it the single most critical technological bottleneck on Earth.',
    economicPillars: 'Advanced microelectronics, semiconductor foundry manufacturing (TSMC, MediaTek, Foxconn), precision machinery, and chemical synthesis.',
    contemporaryContext: 'Center of intense US-China geopolitical friction; subject to frequent military exercises and gray-zone pressure from Beijing while investing heavily in asymmetric "porcupine defense" strategies.',
  },
  {
    name: 'South Korea',
    aliases: ['south korea', 'korea', 'seoul', 'republic of korea', 'samsung', 'hynix'],
    continent: 'East Asia',
    capital: 'Seoul',
    borders: ['North Korea (Demilitarized Zone - DMZ)', 'Yellow Sea (west)', 'Sea of Japan/East Sea (east)'],
    geography: 'Southern half of the Korean Peninsula (~100,363 km²), largely mountainous with coastal plains.',
    strategicSignificance: 'Vital US treaty ally hosting ~28,500 US troops; technological anchor of global memory semiconductors (DRAM/NAND); front line against North Korean nuclear and ballistic missile deterrence.',
    economicPillars: 'Chaebol conglomerates (Samsung, SK Hynix, Hyundai, LG); global leader in dynamic RAM, high-bandwidth memory (HBM for AI accelerators), automobiles, and advanced commercial shipbuilding.',
    contemporaryContext: 'Rapidly emerging as a premier global conventional arms exporter (K2 Black Panther tanks, K9 Thunder howitzers, FA-50 jets to Europe); deepening trilateral defense alignment with the US and Japan.',
  },
  {
    name: 'North Korea',
    aliases: ['north korea', 'dprk', 'pyongyang', 'kim jong un'],
    continent: 'East Asia',
    capital: 'Pyongyang',
    borders: ['South Korea (south along DMZ)', 'China (north along Yalu and Tumen rivers)', 'Russia (northeast)'],
    geography: 'Northern mountainous portion of the Korean Peninsula (~120,540 km²), rich in mineral resources but historically vulnerable to agricultural shortfalls.',
    strategicSignificance: 'Nuclear-armed state with an active intercontinental ballistic missile (ICBM) arsenal and massive conventional artillery pre-targeted at the Seoul metropolitan region; strategic buffer for Beijing.',
    economicPillars: 'Centrally planned command economy heavily reliant on illicit cyber revenues, coal/mineral smuggling, and covert technology barter with Russia and China.',
    contemporaryContext: 'Supplying millions of artillery shells and ballistic missiles to Russia for use in the Ukraine war in exchange for advanced Russian aerospace, satellite, and nuclear submarine technology transfers.',
  },
  {
    name: 'Iran',
    aliases: ['iran', 'tehran', 'persia', 'strait of hormuz', 'persian gulf'],
    continent: 'Middle East (Western Asia)',
    capital: 'Tehran',
    borders: ['Iraq, Turkey (west)', 'Armenia, Azerbaijan, Turkmenistan (north)', 'Afghanistan, Pakistan (east)', 'Persian Gulf & Gulf of Oman (south)'],
    geography: 'Mountainous plateau (Zagros and Alborz ranges) with central arid basins (Dasht-e Kavir), commanding the northern shoreline of the Persian Gulf and the Strait of Hormuz.',
    strategicSignificance: 'Commands the **Strait of Hormuz**, through which approximately 20% of the world\'s petroleum consumption transits daily; leads the "Axis of Resistance" network across the Levant and Arabian Peninsula.',
    economicPillars: 'Massive proven reserves of crude oil and natural gas; petrochemical refining; mineral extraction; under extensive Western sanctions.',
    contemporaryContext: 'Advancing nuclear enrichment program, supplying military drones (Shahed series), and managing acute regional military confrontations across Israel, Lebanon, Syria, and Red Sea shipping routes.',
  },
  {
    name: 'Saudi Arabia',
    aliases: ['saudi arabia', 'riyadh', 'opec', 'aramco', 'saudi'],
    continent: 'Middle East (Arabian Peninsula)',
    capital: 'Riyadh',
    borders: ['Jordan, Iraq, Kuwait (north)', 'Qatar, UAE, Oman (east)', 'Yemen (south)', 'Red Sea (west)', 'Persian Gulf (east)'],
    geography: 'Occupies ~80% of the Arabian Peninsula (~2.15 million km²). Largely hyper-arid desert (Rub\' al Khali), with western mountain escarpments (Hejaz/Asir) along the Red Sea.',
    strategicSignificance: 'De facto leader of OPEC/OPEC+; swing producer of the global oil market capable of altering global inflation with output quota shifts; custodian of Islam\'s two holiest sites (Mecca and Medina).',
    economicPillars: 'State oil giant Saudi Aramco; crude oil exports, natural gas, and petrochemicals; sovereign wealth fund (PIF) driving Vision 2030 modernization into renewable energy, tourism, and technology.',
    contemporaryContext: 'Balancing relationship with the US while deepening commercial ties with China and India; normalizing relations with Iran via Beijing mediation; modernizing domestic economy under Crown Prince Mohammed bin Salman.',
  },
  {
    name: 'Israel',
    aliases: ['israel', 'jerusalem', 'tel aviv', 'gaza', 'idf', 'mossad', 'netanyahu'],
    continent: 'Middle East (Levant)',
    capital: 'Jerusalem',
    borders: ['Lebanon (north)', 'Syria (northeast)', 'Jordan, West Bank (east)', 'Egypt, Gaza Strip (southwest)', 'Mediterranean Sea (west)'],
    geography: 'Compact coastal and desert nation (~22,145 km²) with coastal plain, central Judean hills, Jordan Rift Valley, and southern Negev desert.',
    strategicSignificance: 'Major technological and military powerhouse in the Levant; sole nuclear-capable state in the Middle East; close strategic ally of the United States.',
    economicPillars: 'High-tech "Silicon Wadi" (cybersecurity, AI, semiconductor design, biotech); defense manufacturing (Elbit, IAI, Rafael—Iron Dome, Arrow); polished diamonds and advanced agriculture.',
    contemporaryContext: 'Engaged in severe multi-front conflict since October 7, 2023, conducting intensive military campaigns in Gaza and against Hezbollah in Lebanon and countering long-range strikes from Iran and Yemeni Houthis.',
  },
  {
    name: 'Turkey',
    aliases: ['turkey', 'turkiye', 'ankara', 'istanbul', 'erdogan', 'bosphorus', 'dardanelles'],
    continent: 'Transcontinental (Eurasia - Anatolia & Eastern Thrace)',
    capital: 'Ankara',
    borders: ['Greece, Bulgaria (northwest)', 'Georgia, Armenia, Azerbaijan, Iran (east)', 'Iraq, Syria (south)', 'Black Sea (north)', 'Mediterranean/Aegean Seas (south/west)'],
    geography: 'Strategic land bridge between Southeastern Europe and Western Asia (~783,562 km²), controlling the Turkish Straits (Bosphorus and Dardanelles).',
    strategicSignificance: 'NATO\'s second-largest standing army; controls entry into the Black Sea under the 1936 Montreux Convention; pivotal diplomatic and military broker between the West, Russia, Central Asia, and the Middle East.',
    economicPillars: 'Automotive assembly, textile manufacturing, construction and contracting, civil aviation (Turkish Airlines hub), agricultural products, and indigenous defense export champion (Baykar Bayraktar TB2/Akinci drones).',
    contemporaryContext: 'Practicing assertive independent foreign policy, brokering the Black Sea grain initiative, maintaining ties with both Kyiv and Moscow, and expanding security influence across North Africa and the South Caucasus.',
  },
  {
    name: 'Pakistan',
    aliases: ['pakistan', 'islamabad', 'lahore', 'karachi', 'cpec'],
    continent: 'South Asia',
    capital: 'Islamabad',
    borders: ['India (east)', 'Afghanistan, Iran (west)', 'China (north)', 'Arabian Sea (south)'],
    geography: 'Diverse terrain (~881,913 km²) from the glaciated Karakoram and Hindu Kush peaks to the fertile Indus River basin and arid Balochistan plateau.',
    strategicSignificance: 'Only Muslim-majority nuclear-armed state; critical geopolitical hub connecting South Asia, Central Asia, and the Middle East; terminus of the China-Pakistan Economic Corridor (CPEC - Gwadar Port).',
    economicPillars: 'Textiles and apparel, agricultural produce (basmati rice, cotton), remittances from Gulf diaspora; dependent on multilateral IMF financing.',
    contemporaryContext: 'Grappling with recurring macroeconomic debt crises, domestic political polarization, border tensions with the Afghan Taliban, and balancing long-standing strategic alignment with China.',
  },
  {
    name: 'Egypt',
    aliases: ['egypt', 'cairo', 'suez canal', 'sisi', 'nile'],
    continent: 'Transcontinental (North Africa & Sinai Peninsula)',
    capital: 'Cairo',
    borders: ['Libya (west)', 'Sudan (south)', 'Israel, Gaza Strip (northeast)', 'Mediterranean Sea (north)', 'Red Sea (east)'],
    geography: 'Dominated by the fertile Nile River Valley and Delta bordered by the Sahara and Eastern Deserts (~1,002,450 km²).',
    strategicSignificance: 'Monopolizes the **Suez Canal**, through which ~12% of global maritime trade and ~10% of seaborne crude transits; diplomatic anchor of the Arab world and essential mediator in Israeli-Palestinian negotiations.',
    economicPillars: 'Suez Canal transit tolls, petroleum and natural gas exports (Zohr gas field), tourism, agriculture, and remittances.',
    contemporaryContext: 'Severely impacted by Houthi missile strikes diverting commercial shipping around the Cape of Good Hope, slashing Suez Canal revenues by over 50%; negotiating Nile water security regarding Ethiopia\'s GERD dam.',
  },
  {
    name: 'United Arab Emirates',
    aliases: ['uae', 'united arab emirates', 'dubai', 'abu dhabi', 'emirati'],
    continent: 'Middle East (Arabian Peninsula)',
    capital: 'Abu Dhabi',
    borders: ['Saudi Arabia (south/west)', 'Oman (east)', 'Persian Gulf (north)'],
    geography: 'Desert coastal federation (~83,600 km²) along the southern entrance to the Persian Gulf near the Strait of Hormuz.',
    strategicSignificance: 'Global financial, aviation, and trade logistics gateway linking East and West; major OPEC producer; sovereign wealth powerhouse (ADIA, Mubadala).',
    economicPillars: 'High-grade crude oil and gas; Dubai financial and tourism hub; global maritime logistics (DP World); rapid expansion into artificial intelligence (G42, Falcon LLM) and renewable energy (Masdar).',
    contemporaryContext: 'Architect of the 2020 Abraham Accords; maintaining strategic non-alignment with expanding ties to BRICS, India (CEPA bilateral trade), and the United States.',
  },
  {
    name: 'Germany',
    aliases: ['germany', 'berlin', 'deutschland', 'german'],
    continent: 'Central Europe',
    capital: 'Berlin',
    borders: ['Denmark (north)', 'Poland, Czech Republic (east)', 'Austria, Switzerland (south)', 'France, Luxembourg, Belgium, Netherlands (west)'],
    geography: 'Central European terrain extending from the North and Baltic Sea coasts through forested central uplands to the Bavarian Alps in the south.',
    strategicSignificance: 'Economic powerhouse and demographic anchor of the European Union; key continental NATO member undergoing Zeitenwende (historic military modernization pivot).',
    economicPillars: 'Europe\'s largest national economy; global leader in automotive (BMW, Mercedes, VW), industrial automation (Siemens), chemicals (BASF), and precision machine tools.',
    contemporaryContext: 'Overcoming the loss of cheap Russian pipeline gas by pivoting to LNG, navigating industrial competitiveness concerns, and increasing defense spending to exceed NATO\'s 2% GDP target.',
  },
  {
    name: 'France',
    aliases: ['france', 'paris', 'french', 'macron'],
    continent: 'Western Europe',
    capital: 'Paris',
    borders: ['Belgium, Luxembourg, Germany, Switzerland, Italy, Monaco, Spain, Andorra, Atlantic Ocean, English Channel, Mediterranean Sea'],
    geography: 'Hexagonal geography featuring fertile river plains (Seine, Loire, Rhône), alpine mountain ranges (Alps, Pyrenees), and access to both Atlantic and Mediterranean waters.',
    strategicSignificance: 'Only EU member with an independent nuclear deterrent (force de frappe) and a permanent UN Security Council veto; leading champion of European strategic autonomy and sovereign defense integration.',
    economicPillars: 'High-tech aerospace (Airbus, Dassault), luxury conglomerates (LVMH, Kering), nuclear energy generation (~70% domestic power from nuclear), pharmaceuticals, and agriculture/wine.',
    contemporaryContext: 'Advocating for European self-reliance in security, active naval presence in Indo-Pacific and Mediterranean, managing fiscal consolidation and domestic labor dynamics.',
  },
  {
    name: 'United Kingdom',
    aliases: ['united kingdom', 'uk', 'britain', 'london', 'british', 'england'],
    continent: 'Northwestern Europe',
    capital: 'London',
    borders: ['Republic of Ireland (land border)', 'North Sea, English Channel, Irish Sea, Atlantic Ocean'],
    geography: 'Island nation comprising England, Scotland, Wales, and Northern Ireland (~242,495 km²).',
    strategicSignificance: 'Nuclear weapons state; permanent UN Security Council veto member; key NATO pillar; global financial hub (City of London).',
    economicPillars: 'Global financial and legal services, fintech, pharmaceutical R&D (AstraZeneca, GSK), aerospace and defense (BAE Systems, Rolls-Royce), and creative arts.',
    contemporaryContext: 'Navigating post-Brexit economic adjustments, leading international military aid to Ukraine, and deepening Indo-Pacific defense partnerships (AUKUS).',
  },
  {
    name: 'Japan',
    aliases: ['japan', 'tokyo', 'japanese', 'nippon'],
    continent: 'East Asia',
    capital: 'Tokyo',
    borders: ['Maritime borders with Russia, South Korea, China, Taiwan, and the Pacific Ocean'],
    geography: 'Archipelago of 6,852 islands (main: Honshu, Hokkaido, Kyushu, Shikoku) along the Pacific Ring of Fire, characterized by rugged volcanic mountains and dense coastal urban centers.',
    strategicSignificance: 'Cornerstone of US security architecture in the Pacific; anchor of the Quad; controls maritime straits linking East Asian trade to open ocean.',
    economicPillars: 'Fourth-largest global economy; undisputed leader in automotive manufacturing (Toyota, Honda), robotics, precision optics, electronics, and advanced materials.',
    contemporaryContext: 'Executing historic defense budget doubling to acquire counterstrike capabilities in response to regional security tensions with China and North Korea; managing demographic aging.',
  },
  {
    name: 'Australia',
    aliases: ['australia', 'canberra', 'sydney', 'melbourne', 'aukus'],
    continent: 'Oceania',
    capital: 'Canberra',
    borders: ['Surrounded by Indian and Pacific Oceans; maritime borders with Indonesia, Papua New Guinea, New Zealand'],
    geography: 'Vast island continent (~7.69 million km²) characterized by central arid outback and fertile coastal rims in the east and southeast.',
    strategicSignificance: 'Key southern anchor of Western Indo-Pacific security (AUKUS nuclear-powered submarine partnership with US/UK, Quad member); surveillance anchor of the Southern Ocean and Pacific island corridors.',
    economicPillars: 'Resource superpower: world\'s leading exporter of iron ore, metallurgical coal, liquefied natural gas (LNG), lithium, and critical rare minerals (bauxite, zinc).',
    contemporaryContext: 'Managing economic interdependence with China while bolstering defense deterrence through long-range strike capabilities and domestic manufacturing.',
  },
  {
    name: 'Brazil',
    aliases: ['brazil', 'brasil', 'brasilia', 'lula', 'sao paulo', 'amazon'],
    continent: 'South America',
    capital: 'Brasília',
    borders: ['10 South American countries (borders all except Chile and Ecuador)'],
    geography: 'Fifth-largest country globally (~8.51 million km²), housing the Amazon River basin and rainforest, the Cerrado savanna, and Atlantic coastal mountain ranges.',
    strategicSignificance: 'Dominant geopolitical and economic power in Latin America; founding pillar of BRICS; leader of environmental and biodiversity diplomacy.',
    economicPillars: 'Global agricultural and mining titan: world\'s largest exporter of soybeans, beef, poultry, coffee, sugarcane (ethanol), and iron ore (Vale); deep-water offshore pre-salt oil exploration (Petrobras).',
    contemporaryContext: 'Balancing non-aligned Global South leadership with environmental stewardship of the Amazon, expanding trade ties with China and the European Union.',
  },
];

// --------------------------------------------------------------------------
// 2. CONFLICTS, WARS & MILITARY STRATEGY DOSSIERS
// --------------------------------------------------------------------------
export const CONFLICT_DOSSIERS: ConflictDossier[] = [
  {
    name: 'The War in Ukraine',
    aliases: ['ukraine war', 'russo-ukrainian war', 'invasion of ukraine', 'war in ukraine', 'warfare in ukraine', 'drone warfare in ukraine', 'fpv drone', 'fpv'],
    theater: 'Eastern and Southern Europe (Ukraine, Black Sea, Western Russia)',
    era: '2014–Present (Full-Scale Invasion launched February 24, 2022)',
    belligerents: 'Russian Federation (supported by Belarus, Iranian drones, North Korean munitions) vs. Ukraine (supported by NATO, US, EU logistics, intelligence, and weapons)',
    strategicCauses: 'Post-Cold War European security dilemmas, Russian imperial revanchism, NATO enlargement debate, Ukraine\'s democratic pivot toward the European Union, and contested regional sovereignty over Crimea and Donbas.',
    tacticsAndTechnology: 'The first true "drone and sensor war": widespread employment of inexpensive FPV (first-person view) loitering munitions, uncrewed naval surface vessels (USVs) sinking naval warships, satellite intelligence (Starlink), GPS-guided precision rocket artillery (HIMARS), electronic warfare jamming, and fortified trench networks.',
    geopoliticalRepercussions: 'Ended 30 years of post-Cold War European security architecture; catalyzed historic NATO expansion (Finland and Sweden); triggered complete restructuring of European energy imports away from Russian pipelines; accelerated global defense budget increases worldwide.',
    humanitarianAndEconomicImpact: 'Over 6 million Ukrainian refugees across Europe; tens of thousands of civilian casualties; catastrophic destruction of urban centers (Mariupol, Bakhmut); global surge in grain, fertilizer, and crude oil prices peaking in 2022.',
  },
  {
    name: 'Middle Eastern Multi-Front Escalation',
    aliases: ['gaza war', 'israel hamas war', 'israel hezbollah', 'middle east conflict', 'red sea crisis'],
    theater: 'Levant and Red Sea (Gaza, Israel, Lebanon, Syria, Yemen, Red Sea)',
    era: 'October 2023–Present',
    belligerents: 'State of Israel vs. Hamas, Hezbollah, Yemeni Houthis, and Iranian-aligned proxy networks (with direct missile exchanges between Israel and Iran)',
    strategicCauses: 'Decades-long unresolved Israeli-Palestinian territorial and national conflict, resistance to the Abraham Accords normalization, and regional struggle for strategic hegemony between Israel/US allies and the Iranian-led axis.',
    tacticsAndTechnology: 'Asymmetric urban tunnel warfare in Gaza; multi-layered missile defense networks (Iron Dome, David\'s Sling, Arrow-3, US THAAD); ballistic missile barrages; anti-ship ballistic and cruise missile attacks against commercial shipping in the Bab el-Mandeb strait.',
    geopoliticalRepercussions: 'Forced maritime commercial shipping to bypass the Suez Canal and circumnavigate Africa via the Cape of Good Hope (adding 10–14 days transit and billions in freight costs); disrupted diplomatic normalization talks; created acute risk of broader regional war.',
    humanitarianAndEconomicImpact: 'Catastrophic civilian death toll and widespread famine risk in Gaza; extensive civilian displacement in southern Lebanon and northern Israel; sharp volatility in Brent crude risk premiums.',
  },
  {
    name: 'Taiwan Strait Strategic Tension',
    aliases: ['taiwan strait', 'taiwan invasion', 'us china conflict', 'south china sea'],
    theater: 'Indo-Pacific (Taiwan Strait, East China Sea, First Island Chain)',
    era: '1949–Present (Heightened tensions 2020–Present)',
    belligerents: 'People\'s Republic of China (PLA) vs. Republic of China (Taiwan), with implicit/explicit defense commitments from the United States and regional allies (Japan, Australia)',
    strategicCauses: 'Beijing\'s stated goal of national reunification (refusing to rule out force); Taiwan\'s distinct democratic identity; strategic rivalry between the US and China for dominance in the Western Pacific.',
    tacticsAndTechnology: 'Potential amphibious invasion, naval and aerial blockades, cyber warfare against civilian infrastructure, anti-ship hypersonic missile saturation (DF-21D/DF-26 "carrier killers"), anti-submarine warfare, and Taiwan\'s asymmetric "porcupine" defense (mobile anti-ship Harpoons, sea mines, air defense).',
    geopoliticalRepercussions: 'A full-scale conflict over Taiwan would paralyze the global semiconductor supply chain, likely triggering an immediate estimated 5–10% global GDP contraction—a shock larger than the 2008 financial crisis or the COVID-19 pandemic.',
    humanitarianAndEconomicImpact: 'Immediate cessation of maritime traffic through the Taiwan Strait and South China Sea; catastrophic disruption to global technology, automotive, and industrial manufacturing.',
  },
  {
    name: 'The 1973 Yom Kippur War & First Global Oil Shock',
    aliases: ['1973 oil crisis', 'yom kippur war', 'opec oil embargo', '1973 war', 'petrodollar'],
    theater: 'Middle East (Sinai Peninsula & Golan Heights) and Global Financial Markets',
    era: 'October 1973',
    belligerents: 'Israel vs. Coalition of Arab States (Egypt, Syria) backed by OAPEC members',
    strategicCauses: 'Arab attempt to regain territory lost in the 1967 Six-Day War; weaponization of petroleum by Arab OPEC members against Western nations supporting Israel.',
    tacticsAndTechnology: 'First large-scale deployment of wire-guided anti-tank missiles (Soviet Sagger) and mobile surface-to-air missile belts (SA-6) neutralizing traditional armored thrusts and air superiority; strategic weaponization of crude oil supply cuts and export embargoes.',
    geopoliticalRepercussions: 'Quadrupled global crude oil prices ($3/barrel to nearly $12/barrel), ushering in 1970s global stagflation; gave birth to the Petrodollar recycling system (Kissinger-Saudi pact anchoring crude trade in US Dollars); creation of the International Energy Agency (IEA) and Strategic Petroleum Reserves.',
    humanitarianAndEconomicImpact: 'Severe fuel rationing in the West, double-digit inflation, stock market crash of 1973-1974, and the structural realization of Western energy dependency.',
  },
  {
    name: 'The Persian Gulf War (1990–1991)',
    aliases: ['gulf war', 'operation desert storm', 'desert storm', 'saddam hussein', 'kuwait invasion'],
    theater: 'Persian Gulf (Kuwait, Iraq, Saudi Arabia)',
    era: 'August 1990 – February 1991',
    belligerents: 'US-led 35-nation Coalition vs. Ba\'athist Iraq under Saddam Hussein',
    strategicCauses: 'Iraqi military invasion and annexation of Kuwait over disputed oil fields (Rumaila) and sovereign debt claims, threatening Saudi Arabian oil reserves.',
    tacticsAndTechnology: 'Dawn of the "Revolution in Military Affairs" (RMA): precision-guided munitions (laser-guided bombs), stealth aircraft (F-117 Nighthawk), satellite GPS real-time navigation, Patriot missile interceptions of Scud missiles, and overwhelming 100-hour combined arms ground assault.',
    geopoliticalRepercussions: 'Cemented US status as the sole global hyperpower following the collapse of the Soviet Union; established permanent US forward military presence in the Gulf states, triggering radicalization currents that shaped post-Cold War Middle Eastern dynamics.',
    humanitarianAndEconomicImpact: 'Iraqi forces ignited over 600 Kuwaiti oil wells creating catastrophic environmental smoke plumes; severe economic sanctions imposed on Iraq; crude oil prices spiked before falling sharply once Coalition air dominance was established.',
  },
  {
    name: 'Classical & Contemporary Military Doctrine',
    aliases: ['military strategy', 'clausewitz', 'sun tzu', 'doctrine of war', 'principles of war'],
    theater: 'Universal Strategic Frameworks',
    era: 'Classical to Modern',
    belligerents: 'Foundational Strategic Theorists',
    strategicCauses: 'The nature of human conflict, political compulsion, and organized violence.',
    tacticsAndTechnology: 'Synthesized doctrines across history: Sun Tzu (*The Art of War* — supreme excellence is breaking the enemy\'s resistance without fighting; deception, speed, exploiting weaknesses); Carl von Clausewitz (*On War* — war is the continuation of politics by other means; the "friction" of war, the center of gravity, the fog of war); Alfred Thayer Mahan (*The Influence of Sea Power upon History* — control of maritime choke points and sea lines of communication ensures global empire); Giulio Douhet & John Warden (Strategic Airpower & Five Rings theory).',
    geopoliticalRepercussions: 'Governs modern military doctrine: Combined Arms Maneuver, Asymmetric Defense, Anti-Access/Area Denial (A2/AD), Integrated Air and Missile Defense (IAMD), and Strategic Nuclear Deterrence.',
    humanitarianAndEconomicImpact: 'Reaffirms that military force without clear political end-states leads to protracted, destructive quagmires.',
  },
];

// --------------------------------------------------------------------------
// 3. FIVE CORE MACRO PILLARS (SPECIALIZED DOMAIN KNOWLEDGE)
// --------------------------------------------------------------------------
export const MACRO_SECTOR_DOSSIERS: MacroSectorDossier[] = [
  {
    pillar: 'STOCKS',
    title: 'Stocks & Equity Markets (Microstructure & Capital Dynamics)',
    aliases: [
      'stocks',
      'stock',
      'equities',
      'equity',
      'shares',
      'share',
      'nifty',
      'sensex',
      'nse',
      'bse',
      'market structure',
      'microstructure',
      'price discovery',
      'order book',
      'limit order book',
      'pe ratio',
    ],
    coreMechanisms: 'Equity markets represent fractional ownership claims on corporate cash flows, determined via auction matching engines and electronic limit order books (LOB). Price discovery balances fundamental discounted cash flows (DCF) with institutional order flow, liquidity demand, and macro liquidity conditions.',
    transmissionChannels: 'Central bank interest rates alter discount rates (higher rates compress P/E multiples, especially for long-duration tech); macroeconomic cycles shift corporate earnings; order book imbalance and tick size rules (e.g. ₹0.05 on NSE) govern immediate execution friction and slippage.',
    keyInstitutionsAndAssets: 'Major exchanges (NSE, BSE, NYSE, Nasdaq); benchmarks (Nifty 50, Sensex, S&P 500); institutional flows (FIIs, DIIs, mutual funds, sovereign wealth funds); market regulators (SEBI, SEC).',
    strategicRisks: 'Earnings disappointments, forensic accounting discoveries (corporate governance fraud), unexpected regulatory crackdowns, margin liquidation cascades, and liquidity dry-ups during volatility shocks.',
  },
  {
    pillar: 'COMMERCE',
    title: 'Commerce, Global Trade & Supply Chains',
    aliases: [
      'commerce',
      'global trade',
      'trade flow',
      'trade flows',
      'supply chain',
      'supply chains',
      'tariffs',
      'tariff',
      'shipping',
      'freight',
      'semiconductors',
      'semiconductor',
      'chokepoint',
      'maritime transit',
    ],
    coreMechanisms: 'The cross-border exchange of raw commodities, intermediate components, and finished manufactured goods. Governed by comparative advantage, trade treaties (WTO, USMCA, RCEP), maritime shipping logistics, and tariff frameworks.',
    transmissionChannels: 'Geopolitical blockades of maritime choke points (Strait of Malacca, Suez Canal, Bab el-Mandeb, Panama Canal) inflate container freight rates (Shanghai Containerized Freight Index) and delay component delivery; tariffs and export controls re-route entire global supply chains from just-in-time to just-in-case resilience.',
    keyInstitutionsAndAssets: 'Maritime container giants (Maersk, MSC, COSCO); semiconductor leaders (TSMC, ASML, Nvidia, Intel); critical trade gateways (Rotterdam, Singapore, Shanghai, Nhava Sheva).',
    strategicRisks: 'Protectionist trade wars, weaponized export bans on critical inputs (gallium, germanium, enriched silicon), maritime interdiction by hostile actors, and logistics bottlenecks.',
  },
  {
    pillar: 'CENTRAL_BANKS',
    title: 'Governments & Central Banks (Monetary & Fiscal Policy)',
    aliases: [
      'central bank',
      'central banks',
      'federal reserve',
      'fed',
      'rbi',
      'interest rates',
      'interest rate',
      'repo rate',
      'monetary policy',
      'fiscal policy',
      'inflation',
      'yield curve',
      'quantitative easing',
    ],
    coreMechanisms: 'Central banks control the sovereign currency supply and short-term benchmark policy rates (Federal Funds Rate, RBI Repo Rate) to balance price stability (inflation targets ~4% in India, ~2% in US) with economic output. Governments direct fiscal spending and taxation, financed through sovereign bond issuance.',
    transmissionChannels: 'Rate hikes increase borrowing costs for corporates and mortgages, tightening consumer credit and compressing stock multiples; rate cuts expand bank net interest margins (NIM) and spur liquidity surges; quantitative easing (QE) injects direct base money into financial plumbing.',
    keyInstitutionsAndAssets: 'US Federal Reserve (FOMC), Reserve Bank of India (RBI MPC), European Central Bank (ECB), Bank of Japan (BOJ); sovereign yield curves (US 10-Year Treasury, India 10-Year G-Sec).',
    strategicRisks: 'Persistent stagflation, policy errors (over-tightening into a recession or premature easing sparking second-wave inflation), sovereign debt sustainability distress, and currency depreciation shocks.',
  },
  {
    pillar: 'DEFENSE',
    title: 'Wars, Geopolitics & Military Defense Procurement',
    aliases: [
      'defense',
      'defence',
      'military',
      'arms procurement',
      'defense procurement',
      'hal',
      'bel',
      'bdl',
      'mod',
      'dac',
      'defense spending',
      'drdo',
      'weapons',
    ],
    coreMechanisms: 'State-directed capital allocation toward national security, armed forces modernization, and indigenous defense industrial complexes. In India, spearheaded by the Ministry of Defence (MoD) and the Defence Acquisition Council (DAC) through Acceptance of Necessity (AoN) procedures.',
    transmissionChannels: 'Geopolitical border tensions and regional conflicts trigger emergency capital procurement; policy mandates (such as India\'s Positive Indigenisation Lists) legally block foreign imports, funneling massive multi-year order books directly to domestic defense primes.',
    keyInstitutionsAndAssets: 'Indian Defense PSUs: Hindustan Aeronautics Ltd (HAL — Tejas fighters, Prachand helicopters), Bharat Electronics Ltd (BEL — radars, avionics), Bharat Dynamics Ltd (BDL — anti-tank and surface-to-air missiles); global primes (Lockheed Martin, RTX, BAE Systems, Dassault Aviation).',
    strategicRisks: 'Budget allocation delays, execution bottlenecks, supply dependency on imported aero-engines (e.g. GE F404/F414), and technological obsolescence against rapidly evolving drone swarms.',
  },
  {
    pillar: 'COMMODITIES',
    title: 'Commodities & Energy (Crude Oil, Gas & Strategic Reserves)',
    aliases: [
      'crude oil',
      'oil',
      'brent',
      'wti',
      'opec',
      'energy',
      'natural gas',
      'petroleum',
      'spr',
      'refinery',
      'refining',
    ],
    coreMechanisms: 'Global fossil fuels and strategic raw materials represent the primary physical energy input of human civilization. Crude oil prices (Brent, WTI, Russian Urals) are set at the margin by global supply-demand balances, refining capacity, and geopolitical risk premia.',
    transmissionChannels: 'Supply disruptions in the Middle East or OPEC+ quota reductions spike crude oil prices. For net oil-importing economies like India (which imports over 85% of its crude requirements), an oil price spike expands the current account deficit, depreciates the Rupee, accelerates domestic headline inflation, and severely compresses profit margins for oil-derivative industries (Paints, Tyres, Chemicals).',
    keyInstitutionsAndAssets: 'OPEC+, Saudi Aramco, Indian downstream refiners (Reliance, IOCL, BPCL, HPCL), upstream explorers (ONGC, Oil India), US Strategic Petroleum Reserve (SPR).',
    strategicRisks: 'Closure or missile strikes in the Strait of Hormuz, refining outages, sanctions enforcement on maritime shadow tankers, and geopolitical weaponization of energy flows.',
  },
];

// --------------------------------------------------------------------------
// 4. SCIENCE, COMPUTING & ARTIFICIAL INTELLIGENCE
// --------------------------------------------------------------------------
export const SCIENCE_TOPICS = [
  {
    keywords: ['quantum mechanics', 'quantum physics', 'schrodinger', 'superposition', 'wave function'],
    title: 'Quantum Mechanics: The Probabilistic Universe',
    summary: 'At atomic and subatomic scales, nature abandons deterministic classical trajectories in favor of probabilistic wavefunctions governed by the Schrödinger equation. Particles exist in superpositions of eigenstates until a physical measurement collapses the wave packet.',
  },
  {
    keywords: ['quantum entanglement', 'bell theorem', 'spooky action', 'epr paradox'],
    title: 'Quantum Entanglement & Non-Locality',
    summary: 'When two particles become entangled, their quantum states are fundamentally interdependent regardless of spatial separation. John Bell proved via Bell\'s Theorem that no local hidden variable theory can reproduce quantum mechanics, proving nature is non-local without permitting faster-than-light signaling.',
  },
  {
    keywords: ['general relativity', 'einstein', 'spacetime', 'black hole', 'gravitational waves'],
    title: 'General Relativity: Spacetime Curvature',
    summary: 'Albert Einstein formulated gravity not as an invisible Newtonian force, but as the geometric curvature of 4-dimensional spacetime caused by mass and energy. Mass tells spacetime how to curve; curved spacetime tells mass how to move.',
  },
  {
    keywords: ['transformer architecture', 'attention is all you need', 'self attention', 'moe', 'mixture of experts'],
    title: 'Transformer Architecture & Neural Reasoning',
    summary: 'The Transformer architecture (Vaswani et al., 2017) revolutionized machine intelligence through Scaled Dot-Product Self-Attention. Attention enables every token in a sequence to dynamically attend to and weight every other token simultaneously. Mixture-of-Experts (MoE) expands parameter scale by routing tokens only to specialized sub-networks, enabling frontier reasoning at high inference efficiency.',
  },
  {
    keywords: ['information theory', 'shannon entropy', 'entropy', 'claude shannon', 'bit'],
    title: 'Information Theory & Shannon Entropy',
    summary: 'Formulated by Claude Shannon in 1948. Quantifies the fundamental limit of data compression and communication over noisy channels. Entropy H(X) = -Σ p(x) log2 p(x) measures average uncertainty in a message. In neural models, cross-entropy loss quantifies the divergence between predicted token probabilities and ground truth.',
  },
  {
    keywords: ['bayes theorem', 'bayesian', 'prior probability', 'posterior probability'],
    title: 'Bayes\' Theorem & Probabilistic Inference',
    summary: 'P(A|B) = [P(B|A) * P(A)] / P(B). Expresses how prior beliefs should be updated in the presence of new empirical evidence. Forms the mathematical foundation of modern machine learning, statistical decision theory, and epistemic calibration.',
  },
  {
    keywords: ['evolution', 'natural selection', 'darwin', 'dna', 'genetics'],
    title: 'Evolution by Natural Selection',
    summary: 'The foundational organizing principle of biology: biological organisms exhibit heritable genetic variation through DNA replication and mutation. Organisms with traits that confer reproductive advantages in a given environment survive and reproduce at higher rates, driving evolutionary adaptation over generations.',
  },
];

// --------------------------------------------------------------------------
// 5. PHILOSOPHY & HUMAN REFLECTION
// --------------------------------------------------------------------------
export const PHILOSOPHY_TOPICS = [
  {
    keywords: ['stoicism', 'marcus aurelius', 'epictetus', 'seneca', 'dichotomy of control'],
    title: 'Stoicism: The Dichotomy of Control & Tranquility',
    summary: 'Founded in Athens by Zeno and practiced by Epictetus, Seneca, and Marcus Aurelius. Rooted in distinguishing between what is within our control (opinions, desires, actions) and what is outside our control (external events, reputation, health). Tranquility (ataraxia) arises from mastering one\'s internal judgments and acting with virtue (Wisdom, Courage, Justice, Temperance).',
  },
  {
    keywords: ['existentialism', 'sartre', 'camus', 'meaning of life', 'absurdism'],
    title: 'Existentialism & Camusian Absurdism',
    summary: 'Jean-Paul Sartre established that "existence precedes essence"—human beings first exist and must actively author their own meaning through deliberate choices. Albert Camus confronted the "Absurd"—the collision between humanity\'s yearning for intrinsic purpose and a silent universe—advocating not despair, but heroic rebellion and passionate living.',
  },
];

// --------------------------------------------------------------------------
// 6. QUERY & LOOKUP HELPERS
// --------------------------------------------------------------------------

export function findCountryDossier(query: string): CountryDossier | undefined {
  const q = query.toLowerCase().trim();
  const words = q.split(/\W+/).filter(Boolean);

  return COUNTRY_DOSSIERS.find((c) => {
    if (c.name.toLowerCase() === q) return true;
    return c.aliases.some((alias) => {
      const a = alias.toLowerCase();
      if (a.length <= 3) {
        return words.includes(a);
      }
      return q.includes(a);
    });
  });
}

export function findConflictDossier(query: string): ConflictDossier | undefined {
  const q = query.toLowerCase().trim();
  const words = q.split(/\W+/).filter(Boolean);

  return CONFLICT_DOSSIERS.find((c) => {
    if (c.name.toLowerCase() === q) return true;
    return c.aliases.some((alias) => {
      const a = alias.toLowerCase();
      if (a.length <= 4) {
        return words.includes(a);
      }
      return q.includes(a);
    });
  });
}

export function findMacroSectorDossier(query: string): MacroSectorDossier | undefined {
  const q = query.toLowerCase().trim();
  const words = q.split(/\W+/).filter(Boolean);

  return MACRO_SECTOR_DOSSIERS.find((m) => {
    if (m.title.toLowerCase().includes(q)) return true;
    return m.aliases.some((alias) => {
      const a = alias.toLowerCase();
      if (a.length <= 4) {
        return words.includes(a);
      }
      return q.includes(a);
    });
  });
}

export function findScienceTopic(query: string): { title: string; summary: string } | undefined {
  const q = query.toLowerCase().trim();
  return SCIENCE_TOPICS.find((s) => s.keywords.some((k) => q.includes(k.toLowerCase())));
}

export function findPhilosophyTopic(query: string): { title: string; summary: string } | undefined {
  const q = query.toLowerCase().trim();
  return PHILOSOPHY_TOPICS.find((p) => p.keywords.some((k) => q.includes(k.toLowerCase())));
}
