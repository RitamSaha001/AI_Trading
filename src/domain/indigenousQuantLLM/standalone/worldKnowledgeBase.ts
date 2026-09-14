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
  pillar:
    | 'STOCKS'
    | 'COMMERCE'
    | 'CENTRAL_BANKS'
    | 'DEFENSE'
    | 'COMMODITIES'
    | 'BANKING'
    | 'IT_SERVICES'
    | 'AUTOMOBILE'
    | 'PHARMA'
    | 'METALS'
    | 'FMCG';
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
  {
    pillar: 'BANKING',
    title: 'Banking & Financial Services (Nifty Bank & NBFCs)',
    aliases: [
      'banking',
      'banking sector',
      'bank',
      'banks',
      'nifty bank',
      'bank nifty',
      'hdfc bank',
      'icici bank',
      'sbi',
      'state bank of india',
      'kotak',
      'axis bank',
      'nbfc',
      'bajaj finance',
      'credit growth',
      'npa',
      'nim',
      'nims',
      'net interest margin',
      'casa',
    ],
    coreMechanisms: 'Commercial banking executes maturity transformation—gathering short-term savings/current account deposits (CASA) to fund multi-year corporate capital expenditure, infrastructure, and retail consumer loans. Key financial metrics include Net Interest Margin (NIM = Net Interest Income / Total Earning Assets), Gross & Net Non-Performing Assets (GNPA/NNPA), Provision Coverage Ratio (PCR), and Capital Adequacy Ratio (CAR/CRAR under Basel III).',
    transmissionChannels: 'When the RBI hikes or cuts repo rates, lending rates (linked to External Benchmark Lending Rates / EBLR) reprice immediately, whereas term deposits reprice with a 6-12 month lag. During monetary tightening, banks experience temporary NIM expansion followed by deposit margin compression. Retail credit expansion (credit cards, personal loans) fuels consumer GDP, while elevated corporate credit drives manufacturing capacity utilization.',
    keyInstitutionsAndAssets: 'Systemically Important Banks (D-SIBs): HDFC Bank, ICICI Bank, State Bank of India (SBI); private heavyweights (Axis Bank, Kotak Mahindra Bank); premier NBFCs (Bajaj Finance, Cholamandalam); regulator: Reserve Bank of India (RBI).',
    strategicRisks: 'Asset-Liability Mismatches (ALM), asset quality deterioration in unsecured retail credit portfolios, sudden increases in regulatory risk weights by RBI, and liquidity tightening in interbank call money markets.',
  },
  {
    pillar: 'IT_SERVICES',
    title: 'Information Technology & Software Services (Nifty IT)',
    aliases: [
      'it sector',
      'it services',
      'nifty it',
      'tcs',
      'tata consultancy',
      'infosys',
      'wipro',
      'hcl tech',
      'tech mahindra',
      'ltimindtree',
      'software services',
      'bfsi spending',
      'deal wins',
      'tcv',
      'it spending',
    ],
    coreMechanisms: 'India\'s $250B+ IT services sector operates as a high-margin intellectual export engine, delivering enterprise software architecture, cloud migration, ERP implementation, cybersecurity, and applied GenAI solutions for Fortune 500 multinationals. Revenue visibility is anchored in Total Contract Value (TCV) multi-year deal announcements and Constant Currency (CC) revenue growth.',
    transmissionChannels: 'Corporate enterprise capital allocation in North America and Western Europe directly dictates Indian IT pipeline velocity. BFSI (Banking, Financial Services, and Insurance) represents the single largest vertical (~30% of revenues). A 1% depreciation of the Indian Rupee against the US Dollar translates to a 30-50 basis point operating EBIT margin expansion.',
    keyInstitutionsAndAssets: 'Tier-1 IT Giants: Tata Consultancy Services (TCS), Infosys, HCL Technologies, Wipro, Tech Mahindra, LTIMindtree; benchmark index: Nifty IT; key client ecosystems: Microsoft Azure, AWS, Google Cloud, SAP, Salesforce.',
    strategicRisks: 'Postponement or cancellation of discretionary enterprise IT budgets during US recessionary fears, wage inflation for specialized AI architects, margin pricing pressure from client insourcing/GCCs (Global Capability Centers), and rapid AI automation reducing traditional billable-hour headcounts.',
  },
  {
    pillar: 'AUTOMOBILE',
    title: 'Automobile, Mobility & EV Infrastructure (Nifty Auto)',
    aliases: [
      'auto',
      'automobile',
      'automotive',
      'nifty auto',
      'tata motors',
      'maruti',
      'maruti suzuki',
      'm&m',
      'mahindra',
      'bajaj auto',
      'tvs motor',
      'electric vehicles',
      'ev',
      'two wheelers',
      'commercial vehicles',
    ],
    coreMechanisms: 'The automotive sector reflects aggregate domestic discretionary consumption and freight transportation velocity. Encompasses passenger vehicles (PVs), commercial vehicles (CVs), two-wheelers (2Ws), and tractors. Governed by vehicle financing availability, Average Selling Prices (ASPs), raw material input costs (cold-rolled steel, aluminum, natural rubber), and the structural shift toward electric drivetrains.',
    transmissionChannels: 'Favorable rural monsoon harvests spur rural two-wheeler (Hero, Bajaj) and tractor (M&M) cash purchases. Festive sales (Navratri through Diwali) generate up to 25-30% of annual retail dispatches. Government production-linked incentives (Auto PLI) and FAME subsidies accelerate local battery cell manufacturing and EV charging infrastructure rollout.',
    keyInstitutionsAndAssets: 'Automotive OEMs: Maruti Suzuki (passenger vehicle market share leader), Tata Motors (commercial vehicles, EV leader, Jaguar Land Rover), Mahindra & Mahindra (SUVs & agricultural tractors), Bajaj Auto & TVS Motor (2W/3W exports), Eicher Motors (Royal Enfield).',
    strategicRisks: 'Commodity inflation in steel and lithium battery cells, high auto loan interest rates dampening middle-class vehicle affordability, delayed regulatory clarity on EV emissions/subsidies, and global maritime supply chain disruptions impacting export markets.',
  },
  {
    pillar: 'PHARMA',
    title: 'Pharmaceuticals, Healthcare & Specialty Chemical APIs (Nifty Pharma)',
    aliases: [
      'pharma',
      'pharmaceuticals',
      'nifty pharma',
      'sun pharma',
      'dr reddy',
      'dr reddys',
      'cipla',
      'divis lab',
      'divis laboratories',
      'generic drugs',
      'us fda',
      'form 483',
      'api',
      'biosimilars',
    ],
    coreMechanisms: 'India serves as the "Pharmacy of the World", supplying over 20% of global generic medications by volume and over 40% of generic formulations in the United States. Revenue models span commoditized oral solid generics, complex biosimilars, injectable therapies, and contract development and manufacturing (CDMO) of Active Pharmaceutical Ingredients (APIs).',
    transmissionChannels: 'The primary regulatory catalyst and gatekeeper is the United States Food and Drug Administration (US FDA). A clean Current Good Manufacturing Practice (cGMP) plant audit yielding an Establishment Inspection Report (EIR) unlocks Abbreviated New Drug Application (ANDA) drug approvals, while severe Form 483 inspection observations or Import Alerts halt US exports.',
    keyInstitutionsAndAssets: 'Major Formulators: Sun Pharmaceutical Industries (specialty dermatology & ophthalmology), Dr. Reddy\'s Laboratories (oncology generics & US market reach), Cipla (respiratory therapies & India domestic leadership), Divi\'s Laboratories (global custom chemical API synthesis); regulatory authorities: US FDA, EMA, CDSCO.',
    strategicRisks: 'Price erosion in US commodity generic oral formulations (historic 8-12% annual price declines), adverse patent challenge litigations (Hatch-Waxman Paragraph IV), strict US FDA regulatory compliance crackdowns, and dependency on imported chemical intermediates.',
  },
  {
    pillar: 'METALS',
    title: 'Metals, Mining & Infrastructure Materials (Nifty Metal)',
    aliases: [
      'metals',
      'metal',
      'mining',
      'nifty metal',
      'tata steel',
      'jsw steel',
      'hindalco',
      'coal india',
      'vedanta',
      'steel',
      'aluminum',
      'copper',
      'zinc',
      'iron ore',
      'coking coal',
    ],
    coreMechanisms: 'Deeply cyclical upstream materials industry producing crude steel, primary aluminum, refined copper, and industrial coal. Pricing is determined at the margin by international benchmark spot rates on the London Metal Exchange (LME) and Shanghai Futures Exchange (SHFE), combined with domestic landed import parity prices.',
    transmissionChannels: 'China\'s macroeconomic property construction demand and environmental blast furnace production curtailments drive global steel price parity. Domestic national infrastructure capital outlay (railway electrification, highways, defense armor plating) establishes a resilient floor for domestic Indian steel consumption (JSW, Tata Steel). Elevated coking coal import costs squeeze blast-furnace gross margins.',
    keyInstitutionsAndAssets: 'Steel Giants: Tata Steel, JSW Steel, Jindal Steel & Power (JSPL); Non-Ferrous & Mining: Hindalco Industries (aluminum, Novelis can recycling), Coal India (world\'s largest coal producer), NMDC (merchant iron ore); benchmark: London Metal Exchange (LME).',
    strategicRisks: 'Chinese steel dumping in international export markets during domestic property downturns, sudden imposition of export tariffs, environmental carbon tax barriers (EU Carbon Border Adjustment Mechanism / CBAM), and volatility in imported metallurgical coking coal.',
  },
  {
    pillar: 'FMCG',
    title: 'Consumer Fast-Moving Goods & Retail Staples (Nifty FMCG)',
    aliases: [
      'fmcg',
      'consumer goods',
      'nifty fmcg',
      'hul',
      'hindustan unilever',
      'itc',
      'nestle',
      'nestle india',
      'britannia',
      'tata consumer',
      'marico',
      'dharohar',
      'staples',
      'rural demand',
    ],
    coreMechanisms: 'Consumer packaged staples represent defensive, high-ROCE cash-generating businesses delivering daily essentials across personal care, packaged foods, oral hygiene, and home care. Competitive moats are built on omni-channel retail distribution networks (reaching 9M+ traditional kirana storefronts across India), high brand equity, and advertising scale.',
    transmissionChannels: 'Volume growth is governed by agricultural farm income, rural wage growth, and retail food inflation. Input cost volatility in palm fatty acid distillate (PFAD for soaps), crude-linked packaging polymers, and wheat/milk dictates gross margins. During inflationary cycles, FMCG giants enact grammage reductions (shrinkflation) to protect price points while defending volume.',
    keyInstitutionsAndAssets: 'Market Leaders: Hindustan Unilever Ltd (HUL — soaps, detergents, skin care), ITC Ltd (cigarettes, agricultural sourcing, branded packaged foods), Nestlé India (packaged noodles, infant nutrition, dairy), Britannia Industries (biscuits & bakery), Tata Consumer Products (salt, tea, pulses).',
    strategicRisks: 'Persistent rural wage stagnation causing volume contractions, agricultural commodity price spikes compressing gross margins, intense competitive incursions by agile Direct-to-Consumer (D2C) brands, and local unorganized regional brand price-cutting.',
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
// 6. EXPANDED GENERAL WORLD KNOWLEDGE (SCIENCE, HISTORY, TECH, EVERYDAY)
// --------------------------------------------------------------------------
export interface GeneralKnowledgeItem {
  keywords: string[];
  title: string;
  category: string;
  summary: string;
  detailedAnalysis: string;
  simpleAnalogy: string;
}

export const GENERAL_WORLD_KNOWLEDGE: GeneralKnowledgeItem[] = [
  {
    keywords: ['airplane', 'airplanes fly', 'flight', 'aerodynamics', 'lift', 'bernoulli', 'how do planes fly'],
    title: 'Aerodynamics: How Airplanes Fly',
    category: 'Physics & Engineering',
    summary: 'Aircraft flight is governed by four fundamental forces: Lift, Weight (Gravity), Thrust, and Drag. Lift is generated as air flows around the shaped airfoil of the wings, combining Bernoulli\'s principle (pressure differential) and Newton\'s third law of motion (downward air deflection).',
    detailedAnalysis: `#### 1. The Four Forces of Flight
- **Lift**: The upward aerodynamic force generated by the wings perpendicular to the relative wind.
- **Weight**: The downward gravitational pull on the aircraft mass ($W = mg$).
- **Thrust**: The forward mechanical force produced by jet engines or propellers overcoming drag.
- **Drag**: The resistive friction and pressure forces opposing aircraft forward motion through air.

#### 2. How Wings Generate Lift: The Two Pillars
1. **Bernoulli\'s Principle**: An airfoil is cambered (curved on top, flatter on the bottom). Air traversing the upper surface must accelerate, creating a localized drop in static pressure compared to the higher pressure beneath the wing ($P + \\frac{1}{2}\\rho v^2 = \\text{constant}$).
2. **Newton\'s Third Law (Deflection)**: The wing\'s **Angle of Attack (AoA)** deflects massive volumes of air downwards. For every action, there is an equal and opposite reaction: deflecting thousands of tons of air downwards forces the wing upwards.

#### 3. Control Surfaces
- **Ailerons**: Mounted on outer trailing wing edges; deflect inversely to control **Roll** (banking left/right).
- **Elevators**: Mounted on the horizontal stabilizer of the tail; control **Pitch** (nose up/down).
- **Rudder**: Mounted on the vertical fin; controls **Yaw** (nose left/right).`,
    simpleAnalogy: `Think of sticking your hand out the window of a fast-moving car:
- If your hand is completely flat, the wind slips past effortlessly.
- But tilt your palm up just slightly, and whoosh—the rushing air slams into your palm and pushes your entire arm forcefully upwards!
An airplane wing does the exact same thing, but with an engineered teardrop curve that pulls the plane up from the top and pushes it up from the bottom simultaneously.`,
  },
  {
    keywords: ['photosynthesis', 'plants make food', 'chlorophyll', 'chloroplast', 'calvin cycle'],
    title: 'Photosynthesis: Earth\'s Solar Engine',
    category: 'Biological Sciences',
    summary: 'The biochemical process by which photosynthetic organisms (plants, algae, cyanobacteria) convert light electromagnetic energy into chemical potential energy stored in glucose: 6CO2 + 6H2O + light -> C6H12O6 + 6O2.',
    detailedAnalysis: `#### 1. The Chemical Equation
$$6\\text{CO}_2 + 6\\text{H}_2\\text{O} + \\text{Photons} \\xrightarrow{\\text{Chlorophyll}} \\text{C}_6\\text{H}_{12}\\text{O}_6 + 6\\text{O}_2$$

#### 2. The Two Stages
1. **Light-Dependent Reactions (in Thylakoid Membranes)**:
   - Photons strike Photosystem II and I, exciting electrons in chlorophyll pigments.
   - Water molecules are split (photolysis), releasing oxygen ($O_2$) as a byproduct and donating protons ($H^+$).
   - Electron transport chains pump protons, driving ATP synthase to generate energy currencies: **ATP** and **NADPH**.
2. **The Light-Independent Calvin Cycle (in Chloroplast Stroma)**:
   - Carbon Fixation catalyzed by the enzyme **RuBisCO**, attaching atmospheric $CO_2$ to ribulose-1,5-bisphosphate (RuBP).
   - Utilizes ATP and NADPH to synthesize high-energy 3-carbon sugars (G3P), which combine to form glucose and starches.

#### 3. Ecological Significance
Photosynthesis is the foundational trophic basis of nearly all complex life on Earth, oxygenating the atmosphere and sequestering trillions of tons of carbon.`,
    simpleAnalogy: `Imagine miniature solar-powered kitchen factories inside every green leaf. The factory takes three cheap ingredients—sunlight from above, water from the soil, and carbon dioxide from the air—and bakes sweet energy bars (glucose) to build plant wood, leaves, and fruit, while venting fresh oxygen into the air as a clean byproduct.`,
  },
  {
    keywords: ['roman empire', 'fall of rome', 'rome fell', 'ancient rome', 'caesar', 'barbarians'],
    title: 'The Rise & Fall of the Roman Empire',
    category: 'World History',
    summary: 'The transition from the Roman Republic to the Pax Romana under Augustus, followed centuries later by the fragmentation and collapse of the Western Roman Empire in 476 AD driven by military overextension, economic debasement, political fragmentation, and barbarian migrations.',
    detailedAnalysis: `#### 1. The Imperium Foundation
From its mythical founding in 753 BC to the establishment of the Principate under Caesar Augustus in 27 BC, Rome synthesized administrative bureaucracy, engineering infrastructure (aqueducts, paved military roads), and disciplined legionary doctrine to govern the entire Mediterranean basin (*Mare Nostrum*).

#### 2. Key Drivers of Western Imperial Collapse (476 AD)
1. **Currency Debasement & Fiscal Crisis**: Constant military expenses forced emperors to reduce the silver content of the *denarius* from ~95% down to under 5%, sparking runaway inflation and undermining the monetary economy.
2. **Political Fragmentation & Usurpation**: During the 3rd Century Crisis (235–284 AD), Rome suffered more than 26 claimant emperors in 50 years, eroding central governance until Diocletian divided the empire into Western and Eastern (Byzantine) administrative halves.
3. **Legionary Barbarization & Military Overextension**: Rome increasingly relied on Germanic mercenary federates (*foederati*) who held greater loyalty to their tribal commanders (such as Alaric or Odoacer) than to the imperial throne.
4. **Mass Migrations**: Pushed westward by the arrival of the Huns from Central Asia, Visigoths, Vandals, and Ostrogoths crossed the Rhine and Danube frontiers, sacking Rome (410 and 455 AD) until Odoacer deposed Romulus Augustulus in 476 AD.`,
    simpleAnalogy: `Rome fell like an aging corporate conglomerate that expanded too fast: it took on massive overhead costs to police borders thousands of miles away, watered down its own currency to pay bills, suffered endless executive boardroom coups, and outsourced its defense to outside contractors who eventually realized they could simply take over the company.`,
  },
  {
    keywords: ['computer chip', 'microprocessor', 'semiconductor', 'how do chips work', 'asml', 'transistor', 'cpu'],
    title: 'Semiconductor Microprocessors & Nanometer Fabrication',
    category: 'Technology & Computing',
    summary: 'Modern microprocessors pack tens of billions of microscopic field-effect transistors (MOSFETs) onto a thumbnail-sized sliver of silicon. Transistors act as lightning-fast electronic switches (0 and 1) executing logical Boolean operations billions of times per second.',
    detailedAnalysis: `#### 1. The Building Block: Field-Effect Transistor (FinFET & GAA)
- A transistor consists of a **Source**, **Drain**, and **Gate**. Applying a minute electrical voltage to the gate creates an electron channel that allows current to flow (state $1$); removing the voltage cuts current (state $0$).
- Modern cutting-edge chips (3nm / 2nm nodes by TSMC and Samsung) utilize **Gate-All-Around (GAA) Nanosheets** where the gate material wraps completely around silicon ribbons to prevent quantum tunneling leakage.

#### 2. The Manufacturing Miracle: Extreme Ultraviolet (EUV) Lithography
- Manufactured using colossal photolithography machines produced exclusively by **ASML** in Veldhoven, Netherlands.
- High-power lasers fire at microscopic molten tin droplets falling 50,000 times per second, vaporizing them into plasma that emits EUV light at an ultra-short **13.5 nanometer wavelength**.
- Optical mirrors reflect this light through photomasks to burn circuit patterns hundreds of times smaller than a single coronavirus onto silicon wafers.

#### 3. From Transistors to Computation
Transistors are combined into Boolean logic gates (NAND, NOR, XOR), which form arithmetic logic units (ALUs), register files, and cache hierarchies capable of billions of clock cycles per second (GHz).`,
    simpleAnalogy: `Imagine a city the size of Manhattan, but shrunk down so small it fits on your fingernail. Inside this microscopic city are 50 billion electrical light switches, each so tiny you could fit thousands of them across the width of a single human hair. Every second, those switches flip on and off 4 billion times in synchronized harmony to calculate images, videos, and thoughts.`,
  },
  {
    keywords: ['immune system', 'antibodies', 'vaccine', 'vaccines work', 't cell', 'b cell', 'white blood cells'],
    title: 'The Human Immune System & Vaccinology',
    category: 'Immunology & Medicine',
    summary: 'The human immune defense consists of a two-tiered biological architecture: the rapid, non-specific Innate Immune System (macrophages, neutrophils) and the highly specialized, memorable Adaptive Immune System (B-cells producing antibodies, cytotoxic T-cells).',
    detailedAnalysis: `#### 1. Innate vs. Adaptive Immunity
- **Innate Immunity (First Line)**: Physical barriers (skin, mucosal linings) and rapid cellular responders (macrophages, dendritic cells, natural killer cells) that detect general pathogen-associated molecular patterns (PAMPs) and trigger inflammation.
- **Adaptive Immunity (Targeted Strike)**: Initiated when dendritic cells present digested antigen fragments to helper T-cells ($CD4^+$) in lymph nodes.

#### 2. Adaptive Cellular Machinery
- **B-Lymphocytes & Antibodies**: B-cells undergo somatic hypermutation to produce tailored Y-shaped **immunoglobulin (antibody)** proteins that bind to specific viral spikes, neutralizing pathogens and tagging them for phagocytosis.
- **Cytotoxic T-Cells ($CD8^+$)**: Identify and destroy human cells that have been hijacked by intracellular viruses or turned cancerous.
- **Memory Cells**: After infection clears, long-lived memory B and T cells persist for decades, mounting an instantaneous neutralizing response upon re-exposure.

#### 3. How Vaccines Work
Vaccines introduce harmless antigen proxies (inactivated virus, purified proteins, or mRNA blueprints encoding the surface antigen) to train the adaptive immune system. The body generates antibodies and memory cells with zero risk of full infection.`,
    simpleAnalogy: `Think of your immune system as a high-security defense network:
- Macrophages are the security patrol guards who immediately intercept any suspicious intruder at the gate.
- When an intruder is tough, they bring a snapshot of the intruder\'s face to the elite detectives (T-cells & B-cells).
- The detectives design custom handcuffs (antibodies) that fit the intruder perfectly.
- A **vaccine** is simply distributing "Wanted" posters of the intruder ahead of time, so your security force is already holding the custom handcuffs the moment the real criminal tries to enter.`,
  },
  {
    keywords: ['what is inflation', 'inflation', 'purchasing power', 'cpi', 'why do prices rise'],
    title: 'Inflation, Purchasing Power & Monetary Dynamics',
    category: 'Economics & Monetary Theory',
    summary: 'Inflation represents the persistent, generalized increase in the overall price level of goods and services over time, which equivalently reflects the erosion of the purchasing power of a unit of fiat currency.',
    detailedAnalysis: `#### 1. The Core Drivers of Inflation
1. **Demand-Pull Inflation**: Occurs when aggregate economic demand outpaces aggregate productive capacity ("too much money chasing too few goods").
2. **Cost-Push Inflation**: Occurs when supply-side shocks escalate input costs (such as crude oil spikes or semiconductor shortages), forcing manufacturers to pass higher production costs to end consumers.
3. **Monetary Expansion**: Described by Milton Friedman: *"Inflation is always and everywhere a monetary phenomenon."* When the growth rate of the broad money supply ($M_2$) vastly outpaces real output growth ($Y$), currency purchasing power declines ($MV = PY$).

#### 2. The Transmission & Measurement
- **Consumer Price Index (CPI)**: Measures price changes of a weighted basket of household necessities (food, fuel, housing, transport).
- **Core CPI**: Excludes volatile food and energy components to gauge structural underlying trend inflation.

#### 3. The Central Bank Policy Response
Central banks hike benchmark interest rates (Fed funds rate, RBI repo rate) to make commercial borrowing more expensive and incentivize savings, purposefully cooling consumer credit and corporate capital expenditure to restore equilibrium.`,
    simpleAnalogy: `Imagine an auction room where 10 people are bidding on 5 rare paintings. If everyone in the room suddenly gets handed an extra \$10,000 in cash, the paintings don\'t magically multiply—instead, everyone simply bids higher, and the prices of all 5 paintings skyrocket! Inflation means the money grew faster than the actual stuff you can buy with it.`,
  },
  {
    keywords: ['2008 financial crisis', 'subprime mortgage', 'lehman brothers', 'great recession', 'housing crash'],
    title: 'The 2008 Global Financial Crisis & Subprime Contagion',
    category: 'Economic History & Finance',
    summary: 'The worst systemic financial meltdown since the Great Depression of 1929, triggered by the bursting of the US residential housing bubble, predatory subprime mortgage securitization, extreme leverage in shadow banking, and the collapse of Lehman Brothers in September 2008.',
    detailedAnalysis: `#### 1. Structural Catalysts
1. **Subprime Lending & Deregulation**: Mortgage lenders issued loans with minimal documentation (NINJA loans—No Income, No Job, No Assets) with teaser interest rates, assuming housing prices would appreciate indefinitely.
2. **Securitization Machine**: Investment banks bundled thousands of mortgages into **Collateralized Debt Obligations (CDOs)**, which rating agencies blessed with pristine AAA credit ratings despite underlying junk credit quality.
3. **Credit Default Swaps (CDS) & Extreme Leverage**: Institutions like AIG sold trillions in unhedged insurance contracts (CDS) against CDO default, while investment banks operated with leverage ratios exceeding 30:1.

#### 2. The Meltdown & Domino Collapse
- In 2006–2007, US housing prices peaked and mortgage defaults surged. AAA-rated CDO tranches experienced catastrophic mark-to-market losses.
- In September 2008, **Lehman Brothers** filed for Chapter 11 bankruptcy after short-term commercial paper and interbank repo funding evaporated.
- Interbank lending seized up completely as no bank trusted the solvency of counterparty balance sheets.

#### 3. Policy Interventions & Legacy
- US Government enacted the **Troubled Asset Relief Program (TARP - \$700B)** to recapitalize major financial institutions.
- Federal Reserve slashed rates to 0% and pioneered **Quantitative Easing (QE)**, purchasing trillions in Treasury bonds and mortgage-backed securities to inject systemic liquidity.
- Led to Dodd-Frank regulatory reforms, Basel III Tier-1 capital requirements, and stress testing.`,
    simpleAnalogy: `Imagine building a massive 50-story skyscraper on a foundation of rotten wooden toothpicks, but covering the outside in shiny marble so insurance inspectors grade it "completely indestructible". Once a few toothpicks snap at the bottom, the entire multi-billion-dollar building crumbles into dust—and because every bank on Wall Street owned shares of that building, the whole neighborhood was evacuated.`,
  },
  {
    keywords: ['dark pool', 'dark pools', 'off-exchange', 'ats', 'alternative trading system', 'crossing network'],
    title: 'Dark Pools: Off-Exchange Liquidity & Institutional Trading',
    category: 'Financial Market Microstructure',
    summary: 'Dark pools are private alternative trading systems (ATS) that execute equity trades without displaying pre-trade quotes (bid/ask prices) to the public order book, allowing institutional asset managers to execute block orders without moving the public market.',
    detailedAnalysis: `#### 1. Why Dark Pools Exist: Preventing Adverse Market Impact
When a mutual fund or sovereign pension needs to purchase 500,000 shares of an equity, posting that massive demand on a transparent public limit order book (lit exchange) would cause predatory high-frequency algorithms to front-run the order, pushing prices up and causing severe execution slippage. Dark pools conceal order sizes and prices until *after* execution.

#### 2. How Dark Pools Execute Trades
- **Reference Price Pegging**: Most dark pool transactions execute at the **National Best Bid and Offer (NBBO) Midpoint**, splitting the spread between buyer and seller.
- **Crossing Networks**: Algorithms match non-displayed buy and sell interests at scheduled batch intervals or continuously.
- **Post-Trade Transparency**: While pre-trade quotes are invisible, executed trades must still be reported to Trade Reporting Facilities (TRF) within seconds.

#### 3. Risks & Market Microstructure Debate
- **Lit Market Fragmentation**: When too much institutional volume moves into dark pools (~40%+ of US equity volume), public lit exchanges suffer thinner order books and wider bid-ask spreads.
- **Information Asymmetry**: High-frequency trading firms sometimes navigate dark pool liquidity using ping orders to sniff out institutional institutional blocks.`,
    simpleAnalogy: `Imagine a transparent public auction house where whenever a billionaire walks in to buy art, everyone sees them and immediately doubles their prices. A **dark pool** is like a private VIP back room where buyers and sellers discreetly shake hands at the exact average fair market price without the crowd outside seeing what is happening until the sale is already complete.`,
  },
  {
    keywords: ['napoleon', 'napoleon bonaparte', 'waterloo', 'battle of waterloo', 'napoleonic wars', 'downfall'],
    title: 'Napoleon Bonaparte: Military Genius, Reforms & Fall',
    category: 'World History & Military Strategy',
    summary: 'Emperor of the French (1769–1821) whose military campaigns transformed European warfare and whose civil administration established the Napoleonic Code. After mastering continental Europe, his empire collapsed following the catastrophic 1812 invasion of Russia and final defeat at Waterloo in 1815.',
    detailedAnalysis: `#### 1. The Rise & Military Innovations
Born in Corsica, Napoleon rose rapidly through the French Revolutionary Army. Seizing power in the Coup of 18 Brumaire (1799), he declared himself Emperor in 1804.
- **The Corps d'Armée System**: Organized his Grand Army into autonomous, balanced all-arms corps (infantry, cavalry, artillery) that marched separately for speed and concentrated rapidly at the point of decision ("March divided, fight united").
- **Central Position Doctrine**: Mastered maneuvering between divided enemy coalitions (Austerlitz 1805, Jena-Auerstedt 1806) to destroy each enemy army piecemeal.
- **The Napoleonic Code**: Modernized civil law, meritocratic administration, property rights, and secular legal frameworks still foundational across Europe.

#### 2. What Caused Napoleon's Downfall
1. **The Continental Blockade**: Attempted an economic embargo of Britain, which backfired by alienating European allies and devastating continental trade.
2. **The Peninsular War ("The Spanish Ulcer")**: French occupation of Spain triggered an intractable guerrilla war backed by the British under Wellington, pinning down 300,000 elite troops.
3. **The Catastrophic Russian Campaign (1812)**: Invaded Russia with over 600,000 men. The Russians under Barclay de Tolly and Kutuzov practiced scorched-earth tactics, burning Moscow. Caught in the brutal Russian winter with shattered supply lines, fewer than 100,000 men returned.
4. **The Battle of Leipzig & Waterloo (1813–1815)**: The Coalition forces defeated Napoleon at the Battle of the Nations (Leipzig 1813), forcing his exile to Elba. After escaping for his "Hundred Days", his final defeat at Waterloo (1815) against Anglo-Allied and Prussian forces led to permanent exile on Saint Helena.`,
    simpleAnalogy: `Napoleon was like a brilliant master chess player who won twenty consecutive games by moving faster and outthinking everyone on the board. But then he decided to play on three different boards at the same time, marched his pieces into a freezing blizzard thousands of miles from home where all his pawns starved, and found that all his former opponents had banded together to overwhelm him simultaneously.`,
  },
];

// --------------------------------------------------------------------------
// 7. COUNTRY SUBTOPIC EXTRACTOR & COMPARATIVE SYNTHESIS
// --------------------------------------------------------------------------

export function extractCountrySubTopic(country: CountryDossier, subtopic: string): string {
  const s = subtopic.toLowerCase();

  if (s.includes('economy') || s.includes('trade') || s.includes('gdp') || s.includes('industry')) {
    return `### 📊 Economic Architecture & Trade Dynamics: ${country.name}

**Primary Economic Classification**: ${country.economicPillars}

---

#### 1. Core Economic Foundations & Industrial Base
${country.name}'s macroeconomic posture is anchored by:
- **Key Industrial Clusters**: Advanced specialization in key sectors that define its balance of trade and employment base.
- **Sovereign Resources & Inputs**: Natural endowments, manufacturing capabilities, and human capital infrastructure.
- **Export Powerhouse & Trade Corridors**: Critical integration into international supply networks, relying on maritime and overland transit lanes.

#### 2. Strategic Trade Interdependencies
- **Trade Partners**: Crucial bilateral export and import relationships with regional neighbors and global economic powers.
- **Vulnerabilities**: Sensitivity to international commodity price shocks, currency volatility, and supply chain disruptions.

#### 3. Macroeconomic Health & Outlook
${country.contemporaryContext}

*Would you like to examine ${country.name}'s currency policy, sovereign debt levels, or specific sector performance?*`;
  }

  if (s.includes('military') || s.includes('defense') || s.includes('army') || s.includes('weapon')) {
    return `### 🛡️ Military Capabilities & Defense Doctrine: ${country.name}

**Strategic Posture**: ${country.strategicSignificance}

---

#### 1. Strategic Defense Architecture
- **Doctrinal Focus**: Territorial defense, deterrence, forward force projection, and alliance integration.
- **Key Domestic Capabilities**: Indigenous defense industrial production and maintenance facilities.
- **Modern Warfare Adaptation**: Integration of asymmetric tactics, unmanned aerial systems (drones), electronic warfare (EW), and precision strike capabilities.

#### 2. Alliance Architecture & Security Guarantees
- Bilateral defense treaties and multilateral security frameworks.
- Regional balance of power and deterrence calculations against potential adversaries.

#### 3. Contemporary Security Context
${country.contemporaryContext}`;
  }

  if (s.includes('geography') || s.includes('border') || s.includes('capital') || s.includes('location')) {
    return `### 🗺️ Geographic & Topographical Profile: ${country.name}

**Capital City**: ${country.capital}  
**Continent / Region**: ${country.continent}  
**Direct Borders**: ${country.borders.join(' • ')}

---

#### 1. Topography & Natural Terrain
${country.geography}

#### 2. Strategic Geographical Chokepoints & Waterways
- Territorial control over critical maritime passages, river systems, and transit gateways.
- Topographical barriers (mountain ranges, deserts, plains) shaping military defense lines and internal logistics.`;
  }

  // Fallback to full profile
  return `### 🗺️ Overview of ${country.name}\n\n` +
    `- **Capital**: ${country.capital}\n` +
    `- **Region**: ${country.continent}\n` +
    `- **Strategic Role**: ${country.strategicSignificance}\n` +
    `- **Economic Pillars**: ${country.economicPillars}\n` +
    `- **Contemporary Context**: ${country.contemporaryContext}`;
}

export function compareEntities(entityA: string, entityB: string, subtopic?: string): string {
  const cA = findCountryDossier(entityA);
  const cB = findCountryDossier(entityB);

  if (cA && cB) {
    return `### ⚖️ Strategic Comparison: ${cA.name} vs. ${cB.name}

Both **${cA.name}** and **${cB.name}** occupy pivotal, yet fundamentally contrasting positions on the global chessboard.

---

#### 1. Geopolitical & Strategic Footprint
- **${cA.name}**: ${cA.strategicSignificance}
- **${cB.name}**: ${cB.strategicSignificance}

#### 2. Economic Architecture & Trade Pillars
- **${cA.name}**: ${cA.economicPillars}
- **${cB.name}**: ${cB.economicPillars}

#### 3. Geographic Context & Strategic Neighborhood
- **${cA.name}**: Located in ${cA.continent}, bordering ${cA.borders.slice(0, 3).join(', ')}.
- **${cB.name}**: Located in ${cB.continent}, bordering ${cB.borders.slice(0, 3).join(', ')}.

#### 4. Contemporary Alignment & Friction Points
While ${cA.name} navigates ${cA.contemporaryContext.slice(0, 140)}..., ${cB.name} is shaped by ${cB.contemporaryContext.slice(0, 140)}...

---
*Would you like to compare their military doctrines, bilateral trade balance, or energy dependencies in greater detail?*`;
  }

  const lowerA = entityA.toLowerCase();
  const lowerB = entityB.toLowerCase();
  if (
    ((lowerA.includes('order book') || lowerA.includes('stock') || lowerA.includes('lit') || lowerA.includes('equity')) &&
      (lowerB.includes('dark pool') || lowerB.includes('dark pools'))) ||
    ((lowerB.includes('order book') || lowerB.includes('stock') || lowerB.includes('lit') || lowerB.includes('equity')) &&
      (lowerA.includes('dark pool') || lowerA.includes('dark pools')))
  ) {
    return `### ⚖️ Market Microstructure Comparison: Public Lit Exchanges (LOB) vs. Dark Pools

Both **Electronic Limit Order Books (Lit Exchanges)** and **Dark Pools (ATS)** facilitate equity execution, but they serve fundamentally opposing institutional objectives:

---

#### 1. Pre-Trade Price Transparency
- **Public Lit Order Books**: Fully transparent pre-trade display. Market participants see the full depth of book (Level 2 bids and asks, queue sizes, and price increments) before placing an order.
- **Dark Pools**: Zero pre-trade transparency. Bids, asks, and order sizes remain completely invisible until *after* the trade is matched and executed.

#### 2. Execution Pricing & Mechanism
- **Lit Order Books**: Orders match via continuous double auctions following strict **Price-Time Priority (FIFO)**.
- **Dark Pools**: Most dark pools do not discover price independently; instead, they "peg" execution to the **NBBO Midpoint** (the exact midpoint between the National Best Bid and Offer on lit exchanges), saving half the bid-ask spread for both parties.

#### 3. Market Impact & Information Leakage
- **Lit Order Books**: A massive institutional market order sweeps the book, driving visible execution slippage and allowing high-frequency algorithms to detect the flow.
- **Dark Pools**: Conceived specifically to absorb massive block trades (e.g., 500,000 shares) without tipping off the broader market, minimizing adverse market impact.

#### 4. Systemic Trade-Offs
When institutional volume excessively migrates off-exchange into dark pools (over 40% in modern markets), public lit exchanges experience thinner liquidity, wider bid-ask spreads, and degraded price discovery for retail investors.`;
  }

  return `### ⚖️ Comparative Synthesis: ${entityA} vs. ${entityB}

Analyzing **${entityA}** in contrast to **${entityB}** reveals essential structural distinctions:

1. **Foundational Principles**: How each entity defines its primary mechanisms and objectives.
2. **Operational Scale & Mechanics**: Differences in execution, throughput, and systemic influence.
3. **Strategic Advantages**: What strengths each framework brings to real-world scenarios.
4. **Vulnerabilities**: Where each approach faces friction, bottlenecks, or constraints.`;
}

// --------------------------------------------------------------------------
// 8. QUERY & LOOKUP HELPERS
// --------------------------------------------------------------------------

export function findCountryDossier(query: string): CountryDossier | undefined {
  const q = query.toLowerCase().trim();
  const words = q.split(/\W+/).filter(Boolean);

  return COUNTRY_DOSSIERS.find((c) => {
    if (c.name.toLowerCase() === q) return true;
    return c.aliases.some((alias) => {
      const a = alias.toLowerCase();
      if (a.includes(' ')) {
        return q.includes(a);
      }
      return words.includes(a);
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
      if (a.includes(' ')) {
        return q.includes(a);
      }
      return words.includes(a);
    });
  });
}

export function findMacroSectorDossier(query: string): MacroSectorDossier | undefined {
  const q = query.toLowerCase().trim();
  const words = q.split(/\W+/).filter(Boolean);

  let bestDossier: MacroSectorDossier | undefined = undefined;
  let bestScore = 0;

  const specificIndustrySectors = ['BANKING', 'IT_SERVICES', 'AUTOMOBILE', 'PHARMA', 'METALS', 'FMCG'];

  for (const m of MACRO_SECTOR_DOSSIERS) {
    let score = 0;
    if (m.title.toLowerCase().includes(q)) {
      score += 200;
    }

    let matchedAliases = 0;
    for (const alias of m.aliases) {
      const a = alias.toLowerCase();
      if (a.includes(' ')) {
        if (q.includes(a)) {
          score += a.length * 4;
          matchedAliases++;
        }
      } else {
        if (words.includes(a)) {
          score += a.length * 2;
          matchedAliases++;
        }
      }
    }

    if (matchedAliases > 0) {
      // Prioritize specific industry sector dossiers when the user explicitly queries sector dynamics
      if (specificIndustrySectors.includes(m.pillar)) {
        score += 60;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestDossier = m;
    }
  }

  return bestDossier;
}

export function findScienceTopic(query: string): { title: string; summary: string } | undefined {
  const q = query.toLowerCase().trim();
  const words = q.split(/\W+/).filter(Boolean);
  return SCIENCE_TOPICS.find((s) =>
    s.keywords.some((k) => {
      const kLower = k.toLowerCase();
      if (kLower.includes(' ')) return q.includes(kLower);
      return words.includes(kLower);
    })
  );
}

export function findPhilosophyTopic(query: string): { title: string; summary: string } | undefined {
  const q = query.toLowerCase().trim();
  const words = q.split(/\W+/).filter(Boolean);
  return PHILOSOPHY_TOPICS.find((p) =>
    p.keywords.some((k) => {
      const kLower = k.toLowerCase();
      if (kLower.includes(' ')) return q.includes(kLower);
      return words.includes(kLower);
    })
  );
}

export function findGeneralKnowledgeTopic(query: string): GeneralKnowledgeItem | undefined {
  const q = query.toLowerCase().trim();
  const words = q.split(/\W+/).filter(Boolean);

  return GENERAL_WORLD_KNOWLEDGE.find((item) =>
    item.keywords.some((k) => {
      const kLower = k.toLowerCase();
      if (kLower.includes(' ')) return q.includes(kLower);
      return words.includes(kLower);
    })
  );
}

