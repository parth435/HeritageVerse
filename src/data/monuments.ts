export type Monument = {
  id: string;
  name: string;
  place: string;
  era: string;
  year: string;
  unesco: boolean;
  x: number;
  y: number;
  image: string;
  thenImage: string;
  nowImage: string;
  blurb: string;
  material: string;
};

export const monuments: Monument[] = [
  {
    id: "taj",
    name: "Taj Mahal",
    place: "Agra, Uttar Pradesh",
    era: "Mughal",
    year: "1632–1653",
    unesco: true,
    x: 48,
    y: 38,
    image:
      "https://images.unsplash.com/photo-1564507592333-c60657eea523?auto=format&fit=crop&w=1800&q=80",
    thenImage:
      "https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&w=1600&q=80",
    nowImage:
      "https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=1600&q=80",
    blurb:
      "A marble mausoleum of grief and geometry — four minarets, a river garden, and a dome that still holds the sky.",
    material: "Makrana marble",
  },
  {
    id: "hampi",
    name: "Hampi",
    place: "Vijayanagara, Karnataka",
    era: "Vijayanagara",
    year: "14th–16th c.",
    unesco: true,
    x: 42,
    y: 72,
    image:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSD01hxHwFQbbp_rvjlKbxChgKCB8FOaCW2N3nOeHjGcZ55zXfQJ8t-kL8&s=10",
    thenImage:
      "https://images.unsplash.com/photo-1582510003544-4d00b7f74232?auto=format&fit=crop&w=1600&q=80",
    nowImage:
      "https://images.unsplash.com/photo-1590050752117-238cb0fb12b1?auto=format&fit=crop&w=1600&q=80",
    blurb:
      "A ruined capital of stone chariots and boulder temples, once the beating market of a southern empire.",
    material: "Granite & schist",
  },
  {
    id: "konark",
    name: "Konark Sun Temple",
    place: "Puri, Odisha",
    era: "Eastern Ganga",
    year: "c. 1250",
    unesco: true,
    x: 62,
    y: 58,
    image:
      "https://images.unsplash.com/photo-1627894483216-2138af692e32?auto=format&fit=crop&w=1800&q=80",
    thenImage:
      "https://images.unsplash.com/photo-1706469614777-8ad0c4a0e0c6?auto=format&fit=crop&w=1600&q=80",
    nowImage:
      "https://images.unsplash.com/photo-1599661046289-e31897846e41?auto=format&fit=crop&w=1600&q=80",
    blurb:
      "A colossal chariot of the sun — twenty-four wheels, seven horses, and a temple engineered as cosmology.",
    material: "Khondalite stone",
  },
  {
    id: "ajanta",
    name: "Ajanta Caves",
    place: "Aurangabad, Maharashtra",
    era: "Satavahana–Vakataka",
    year: "2nd c. BCE–480 CE",
    unesco: true,
    x: 38,
    y: 54,
    image:
      "https://media-cdn.tripadvisor.com/media/attractions-splice-spp-674x446/0a/4b/5f/aa.jpg",
    thenImage:
      "https://images.unsplash.com/photo-1605649487212-47bdab064df7?auto=format&fit=crop&w=1600&q=80",
    nowImage:
      "https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=1600&q=80",
    blurb:
      "Painted rock-cut viharas in a horseshoe gorge — Buddhist narrative still glowing on cave plaster.",
    material: "Basalt & fresco",
  },
  {
    id: "qutub",
    name: "Qutub Minar",
    place: "Delhi",
    era: "Delhi Sultanate",
    year: "1192–1220",
    unesco: true,
    x: 46,
    y: 32,
    image:
      "https://images.unsplash.com/photo-1587474260584-136574528ed5?auto=format&fit=crop&w=1800&q=80",
    thenImage:
      "https://images.unsplash.com/photo-1596176530529-78163a4f7af2?auto=format&fit=crop&w=1600&q=80",
    nowImage:
      "https://images.unsplash.com/photo-1592639296346-560c37c0f710?auto=format&fit=crop&w=1600&q=80",
    blurb:
      "A victory tower of red sandstone and marble, wrapping calligraphy around five tapering storeys.",
    material: "Sandstone & marble",
  },
  {
    id: "meenakshi",
    name: "Meenakshi Amman",
    place: "Madurai, Tamil Nadu",
    era: "Nayak",
    year: "17th c. (rebuilt)",
    unesco: false,
    x: 46,
    y: 86,
    image:
      "https://i.natgeofe.com/n/b9e9b8d1-fa08-4b90-96bb-310cace03847/meenakshi-amman-temple-india.jpg",
    thenImage:
      "https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?auto=format&fit=crop&w=1600&q=80",
    nowImage:
      "https://images.unsplash.com/photo-1626132647523-6614d45bf1c6?auto=format&fit=crop&w=1600&q=80",
    blurb:
      "A living temple-city of gopurams — thousands of stucco gods stacked into a skyline of colour.",
    material: "Granite & stucco",
  },
];

export const journeyStops = [
  { year: "c. 200 BCE", title: "Rock is opened", copy: "At Ajanta, monks cut viharas into the cliff and begin a painted canon of the Buddha’s lives." },
  { year: "1192", title: "A tower of victory", copy: "Qutb-ud-din Aibak lays the first storey of a minaret that will become Delhi’s vertical signature." },
  { year: "1250", title: "The sun’s chariot", copy: "Narasingha Deva I commissions Konark as architecture that is also a calendar of stone wheels." },
  { year: "1509", title: "Hampi at zenith", copy: "Krishnadevaraya’s Vijayanagara becomes one of the largest cities on earth, markets ringing the Vitthala temple." },
  { year: "1632", title: "A tomb for Arjumand", copy: "Shah Jahan begins the Taj Mahal. Twenty-two years of marble, inlay, and a garden of paradise." },
  { year: "1983", title: "World heritage", copy: "UNESCO inscribes the Taj. Conservation becomes a global operating system, not a local craft alone." },
];

export const layers = [
  { id: "plinth", label: "Plinth & platform", y: 78, height: 22, note: "Raised marble terrace that lifts the mausoleum above the Yamuna floodplain." },
  { id: "garden", label: "Charbagh garden", y: 62, height: 16, note: "Four-fold Islamic garden: water, fruit, and geometry as a map of paradise." },
  { id: "tomb", label: "Mausoleum chamber", y: 38, height: 24, note: "Octagonal inner chamber with the cenotaphs; true graves lie in the crypt below." },
  { id: "dome", label: "Onion dome", y: 16, height: 22, note: "Double-shell dome — an inner ceiling for acoustics, an outer skyline for the river." },
  { id: "finial", label: "Lotus finial", y: 4, height: 12, note: "Gilded finial mixing Islamic crescent with a lotus — syncretic crown of the monument." },
];
