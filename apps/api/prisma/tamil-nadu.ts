// Service areas for all 38 Tamil Nadu districts, as district → zone → area.
// A zone is the district itself, except large cities, which are split
// (Chennai North, Chennai South, …). Stored in `zones` as district / city / location.
// Coordinates are approximate area centres for the live tracking map.

type Area = [name: string, lat: number, lng: number]
export type ZoneSeed = [district: string, zone: string, areas: Area[]]

/** One zone named after the district. */
const one = (district: string, areas: Area[]): ZoneSeed => [district, district, areas]

export const tamilNaduZones: ZoneSeed[] = [
  one("Ariyalur", [
    ["Ariyalur", 11.1401, 79.0782],
    ["Jayankondam", 11.212, 79.364],
    ["Sendurai", 11.25, 79.174],
  ]),
  one("Chengalpattu", [
    ["Chengalpattu", 12.692, 79.977],
    ["Tambaram", 12.9249, 80.1],
    ["Pallavaram", 12.9675, 80.1491],
    ["Guduvanchery", 12.845, 80.06],
    ["Kelambakkam", 12.787, 80.22],
    ["Mahabalipuram", 12.6208, 80.1945],
  ]),
  [
    "Chennai",
    "Chennai North",
    [
      ["Tondiarpet", 13.1263, 80.288],
      ["Royapuram", 13.1137, 80.2954],
      ["Perambur", 13.1186, 80.2333],
      ["Kolathur", 13.124, 80.212],
      ["Madhavaram", 13.1488, 80.2306],
    ],
  ],
  [
    "Chennai",
    "Chennai Central",
    [
      ["Egmore", 13.0732, 80.2609],
      ["T. Nagar", 13.0418, 80.2341],
      ["Nungambakkam", 13.0569, 80.2425],
      ["Mylapore", 13.0368, 80.2676],
      ["Anna Nagar", 13.085, 80.2101],
    ],
  ],
  [
    "Chennai",
    "Chennai West",
    [
      ["Vadapalani", 13.05, 80.2121],
      ["Koyambedu", 13.0694, 80.1948],
      ["Valasaravakkam", 13.0403, 80.1723],
      ["Porur", 13.0382, 80.1565],
      ["Ambattur", 13.1143, 80.1548],
    ],
  ],
  [
    "Chennai",
    "Chennai South",
    [
      ["Adyar", 13.0012, 80.2565],
      ["Velachery", 12.9791, 80.2209],
      ["Guindy", 13.0067, 80.2206],
      ["Saidapet", 13.0213, 80.2231],
      ["Thiruvanmiyur", 12.983, 80.2594],
    ],
  ],
  [
    "Chennai",
    "Chennai East",
    [
      ["Besant Nagar", 13.0003, 80.2667],
      ["Kottivakkam", 12.968, 80.2595],
      ["Perungudi", 12.9654, 80.2461],
      ["Thoraipakkam", 12.9416, 80.2362],
      ["Sholinganallur", 12.901, 80.2279],
    ],
  ],
  [
    "Coimbatore",
    "Coimbatore North",
    [
      ["Gandhipuram", 11.0168, 76.9658],
      ["Saibaba Colony", 11.0247, 76.9452],
      ["Ganapathy", 11.04, 76.98],
      ["Thudiyalur", 11.0806, 76.9426],
    ],
  ],
  [
    "Coimbatore",
    "Coimbatore South",
    [
      ["RS Puram", 11.0089, 76.95],
      ["Ukkadam", 10.9906, 76.9614],
      ["Podanur", 10.9696, 76.9799],
      ["Kuniyamuthur", 10.96, 76.95],
    ],
  ],
  [
    "Coimbatore",
    "Coimbatore East",
    [
      ["Peelamedu", 11.03, 77.027],
      ["Singanallur", 10.999, 77.03],
      ["Saravanampatti", 11.078, 77.002],
    ],
  ],
  [
    "Coimbatore",
    "Coimbatore West",
    [
      ["Vadavalli", 11.0256, 76.9031],
      ["Thondamuthur", 10.99, 76.84],
    ],
  ],
  [
    "Coimbatore",
    "Coimbatore Rural",
    [
      ["Pollachi", 10.6609, 77.0048],
      ["Mettupalayam", 11.299, 76.936],
    ],
  ],
  one("Cuddalore", [
    ["Cuddalore", 11.748, 79.7714],
    ["Chidambaram", 11.399, 79.693],
    ["Neyveli", 11.543, 79.48],
    ["Panruti", 11.776, 79.552],
    ["Virudhachalam", 11.518, 79.324],
  ]),
  one("Dharmapuri", [
    ["Dharmapuri", 12.1277, 78.1582],
    ["Harur", 12.052, 78.482],
    ["Palacode", 12.305, 78.07],
    ["Pennagaram", 12.133, 77.896],
  ]),
  one("Dindigul", [
    ["Dindigul", 10.3624, 77.9695],
    ["Palani", 10.45, 77.52],
    ["Kodaikanal", 10.2381, 77.4892],
    ["Oddanchatram", 10.487, 77.75],
    ["Natham", 10.224, 78.23],
  ]),
  one("Erode", [
    ["Erode", 11.341, 77.7172],
    ["Perundurai", 11.275, 77.588],
    ["Bhavani", 11.445, 77.682],
    ["Gobichettipalayam", 11.455, 77.442],
    ["Sathyamangalam", 11.505, 77.238],
  ]),
  one("Kallakurichi", [
    ["Kallakurichi", 11.738, 78.962],
    ["Ulundurpet", 11.687, 79.29],
    ["Chinnasalem", 11.634, 78.876],
    ["Sankarapuram", 11.886, 78.915],
  ]),
  one("Kancheepuram", [
    ["Kancheepuram", 12.8342, 79.7036],
    ["Sriperumbudur", 12.967, 79.942],
    ["Walajabad", 12.792, 79.823],
    ["Uthiramerur", 12.615, 79.757],
  ]),
  one("Kanniyakumari", [
    ["Nagercoil", 8.1833, 77.4119],
    ["Kanniyakumari", 8.0883, 77.5385],
    ["Marthandam", 8.307, 77.221],
    ["Thuckalay", 8.249, 77.32],
    ["Colachel", 8.174, 77.259],
  ]),
  one("Karur", [
    ["Karur", 10.9601, 78.0766],
    ["Kulithalai", 10.935, 78.42],
    ["Aravakurichi", 10.776, 77.905],
  ]),
  one("Krishnagiri", [
    ["Krishnagiri", 12.5186, 78.2137],
    ["Hosur", 12.7409, 77.8253],
    ["Denkanikottai", 12.53, 77.79],
    ["Uthangarai", 12.265, 78.535],
  ]),
  [
    "Madurai",
    "Madurai Central",
    [
      ["Simmakkal", 9.926, 78.121],
      ["Goripalayam", 9.931, 78.127],
    ],
  ],
  [
    "Madurai",
    "Madurai North",
    [
      ["Tallakulam", 9.94, 78.133],
      ["Mattuthavani", 9.942, 78.155],
      ["Uthangudi", 9.955, 78.165],
    ],
  ],
  [
    "Madurai",
    "Madurai East",
    [
      ["Anna Nagar", 9.929, 78.146],
      ["KK Nagar", 9.9369, 78.1428],
      ["Vandiyur", 9.92, 78.16],
    ],
  ],
  [
    "Madurai",
    "Madurai West",
    [
      ["Periyar Bus Stand", 9.9177, 78.1148],
      ["Arapalayam", 9.933, 78.101],
      ["Kalavasal", 9.929, 78.095],
      ["Ponmeni", 9.923, 78.09],
    ],
  ],
  [
    "Madurai",
    "Madurai South",
    [
      ["Avaniyapuram", 9.884, 78.111],
      ["Palanganatham", 9.903, 78.102],
      ["Thirupparankundram", 9.879, 78.072],
    ],
  ],
  one("Mayiladuthurai", [
    ["Mayiladuthurai", 11.1018, 79.652],
    ["Sirkazhi", 11.238, 79.736],
    ["Tharangambadi", 11.027, 79.854],
  ]),
  one("Nagapattinam", [
    ["Nagapattinam", 10.7672, 79.8449],
    ["Velankanni", 10.682, 79.851],
    ["Kilvelur", 10.766, 79.74],
    ["Vedaranyam", 10.374, 79.85],
  ]),
  one("Namakkal", [
    ["Namakkal", 11.2189, 78.1674],
    ["Tiruchengode", 11.382, 77.895],
    ["Rasipuram", 11.46, 78.184],
    ["Paramathi Velur", 11.108, 78.005],
  ]),
  one("Nilgiris", [
    ["Ooty", 11.4102, 76.695],
    ["Coonoor", 11.353, 76.7959],
    ["Kotagiri", 11.421, 76.861],
    ["Gudalur", 11.503, 76.493],
  ]),
  one("Perambalur", [
    ["Perambalur", 11.234, 78.883],
    ["Veppanthattai", 11.348, 78.861],
    ["Kunnam", 11.258, 79.023],
  ]),
  one("Pudukkottai", [
    ["Pudukkottai", 10.3797, 78.8205],
    ["Aranthangi", 10.17, 78.99],
    ["Alangudi", 10.36, 78.98],
    ["Gandarvakottai", 10.565, 79.03],
  ]),
  one("Ramanathapuram", [
    ["Ramanathapuram", 9.3639, 78.8395],
    ["Rameswaram", 9.2876, 79.3129],
    ["Paramakudi", 9.545, 78.59],
    ["Kilakarai", 9.233, 78.784],
  ]),
  one("Ranipet", [
    ["Ranipet", 12.9272, 79.333],
    ["Visharam", 12.919, 79.254],
    ["Arcot", 12.905, 79.319],
    ["Walajapet", 12.925, 79.366],
    ["Arakkonam", 13.08, 79.67],
    ["Sholinghur", 13.117, 79.419],
  ]),
  [
    "Salem",
    "Salem Central",
    [
      ["Shevapet", 11.652, 78.153],
      ["New Bus Stand", 11.672, 78.134],
    ],
  ],
  [
    "Salem",
    "Salem North",
    [
      ["Hasthampatti", 11.669, 78.156],
      ["Fairlands", 11.674, 78.14],
      ["Alagapuram", 11.68, 78.135],
    ],
  ],
  [
    "Salem",
    "Salem South",
    [
      ["Kondalampatti", 11.625, 78.125],
      ["Gugai", 11.646, 78.16],
    ],
  ],
  [
    "Salem",
    "Salem East",
    [
      ["Ammapet", 11.653, 78.182],
      ["Attur", 11.596, 78.6],
    ],
  ],
  [
    "Salem",
    "Salem West",
    [
      ["Suramangalam", 11.67, 78.11],
      ["Omalur", 11.744, 78.047],
    ],
  ],
  one("Sivaganga", [
    ["Sivaganga", 9.847, 78.48],
    ["Karaikudi", 10.073, 78.78],
    ["Devakottai", 9.947, 78.823],
    ["Manamadurai", 9.695, 78.458],
  ]),
  one("Tenkasi", [
    ["Tenkasi", 8.9594, 77.3152],
    ["Courtallam", 8.933, 77.279],
    ["Kadayanallur", 9.074, 77.342],
    ["Sankarankovil", 9.172, 77.544],
  ]),
  one("Thanjavur", [
    ["Thanjavur", 10.787, 79.1378],
    ["Kumbakonam", 10.9617, 79.3881],
    ["Pattukkottai", 10.423, 79.319],
    ["Papanasam", 10.926, 79.271],
  ]),
  one("Theni", [
    ["Theni", 10.0104, 77.4768],
    ["Periyakulam", 10.121, 77.545],
    ["Bodinayakanur", 10.011, 77.35],
    ["Andipatti", 9.999, 77.621],
    ["Cumbum", 9.737, 77.282],
  ]),
  one("Thoothukudi", [
    ["Thoothukudi", 8.7642, 78.1348],
    ["Tiruchendur", 8.497, 78.119],
    ["Kovilpatti", 9.172, 77.869],
    ["Srivaikuntam", 8.63, 77.913],
    ["Kayalpattinam", 8.569, 78.117],
  ]),
  [
    "Tiruchirappalli",
    "Tiruchirappalli Central",
    [
      ["Central Bus Stand", 10.7996, 78.6826],
      ["Chathiram Bus Stand", 10.832, 78.695],
      ["Thillai Nagar", 10.827, 78.683],
    ],
  ],
  [
    "Tiruchirappalli",
    "Tiruchirappalli North",
    [
      ["Srirangam", 10.8628, 78.6926],
      ["Thiruvanaikoil", 10.853, 78.705],
      ["Samayapuram", 10.925, 78.741],
    ],
  ],
  [
    "Tiruchirappalli",
    "Tiruchirappalli South",
    [
      ["KK Nagar", 10.768, 78.696],
      ["Subramaniapuram", 10.784, 78.705],
      ["Edamalaipatti Pudur", 10.779, 78.675],
    ],
  ],
  [
    "Tiruchirappalli",
    "Tiruchirappalli East",
    [
      ["Thiruverumbur", 10.78, 78.775],
      ["BHEL Township", 10.77, 78.81],
    ],
  ],
  one("Tirunelveli", [
    ["Tirunelveli Junction", 8.731, 77.709],
    ["Palayamkottai", 8.725, 77.736],
    ["Melapalayam", 8.697, 77.728],
    ["Ambasamudram", 8.71, 77.453],
    ["Valliyur", 8.384, 77.61],
  ]),
  one("Tirupathur", [
    ["Tirupathur", 12.496, 78.573],
    ["Jolarpettai", 12.565, 78.577],
    ["Vaniyambadi", 12.682, 78.62],
    ["Ambur", 12.79, 78.716],
  ]),
  one("Tiruppur", [
    ["Tiruppur", 11.1085, 77.3411],
    ["Avinashi", 11.192, 77.269],
    ["Palladam", 10.99, 77.286],
    ["Kangeyam", 11.006, 77.562],
    ["Dharapuram", 10.738, 77.531],
    ["Udumalaipettai", 10.588, 77.247],
  ]),
  one("Tiruvallur", [
    ["Tiruvallur", 13.143, 79.908],
    ["Avadi", 13.1067, 80.097],
    ["Poonamallee", 13.048, 80.096],
    ["Ponneri", 13.338, 80.195],
    ["Gummidipoondi", 13.407, 80.108],
    ["Tiruttani", 13.175, 79.616],
  ]),
  one("Tiruvannamalai", [
    ["Tiruvannamalai", 12.2253, 79.0747],
    ["Arani", 12.67, 79.285],
    ["Cheyyar", 12.662, 79.543],
    ["Polur", 12.512, 79.125],
    ["Vandavasi", 12.505, 79.62],
  ]),
  one("Tiruvarur", [
    ["Tiruvarur", 10.7726, 79.6368],
    ["Mannargudi", 10.665, 79.451],
    ["Thiruthuraipoondi", 10.53, 79.636],
    ["Kodavasal", 10.853, 79.485],
  ]),
  one("Vellore", [
    ["Vellore", 12.9165, 79.1325],
    ["Katpadi", 12.969, 79.145],
    ["Anaicut", 12.998, 79.056],
    ["Gudiyatham", 12.949, 78.873],
    ["Pernambut", 12.938, 78.718],
  ]),
  one("Viluppuram", [
    ["Viluppuram", 11.9401, 79.4861],
    ["Vikravandi", 12.036, 79.546],
    ["Tindivanam", 12.234, 79.655],
    ["Gingee", 12.253, 79.417],
    ["Kottakuppam", 11.962, 79.837],
  ]),
  one("Virudhunagar", [
    ["Virudhunagar", 9.585, 77.9579],
    ["Sivakasi", 9.453, 77.802],
    ["Aruppukottai", 9.51, 78.096],
    ["Rajapalayam", 9.451, 77.556],
    ["Srivilliputhur", 9.512, 77.633],
  ]),
]
