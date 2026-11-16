/**
 * Known brands: banks (account icons) and shops / services (payees). The web app shows their logo
 * (apps/web/src/assets/brands/<id>.*) next to accounts and payees; `aliases` recognise a payee
 * also in bank statements ("LIDL BULGARIA EOOD 1234") and in Cyrillic; `category` is the
 * category a payment there usually belongs to (key of the default category tree).
 */

export type BrandKind = 'bank' | 'fintech' | 'voucher' | 'shop';

export interface BrandInfo {
  /** Logo file name; stored on accounts as the icon `brand-<id>`. */
  id: string;
  name: string;
  kind: BrandKind;
  /** ISO country for banks (null = international). */
  country: string | null;
  /** Website – where the logo comes from. */
  domain: string;
  /** Other spellings (lower case); the name itself always matches. */
  aliases?: string[];
  /** Usual category of a payment (e.g. `food.groceries`). */
  category?: string;
}

type Row = [id: string, name: string, domain: string, aliases?: string[], category?: string];

const banks = (country: string | null, kind: BrandKind, rows: Row[]): BrandInfo[] =>
  rows.map(([id, name, domain, aliases]) => ({ id, name, kind, country, domain, aliases }));
const shops = (rows: Row[]): BrandInfo[] =>
  rows.map(([id, name, domain, aliases, category]) => ({
    id,
    name,
    kind: 'shop',
    country: null,
    domain,
    aliases,
    category,
  }));

export const BRAND_LIST: readonly BrandInfo[] = [
  // ───────────────────────────── Bulgaria: all banks ─────────────────────────────
  ...banks('BG', 'bank', [
    [
      'unicredit-bulbank',
      'UniCredit Bulbank',
      'unicreditbulbank.bg',
      ['bulbank', 'булбанк', 'уникредит'],
    ],
    ['dsk', 'DSK Bank', 'dskbank.bg', ['дск', 'dsk bank', 'банка дск']],
    ['ubb', 'UBB', 'ubb.bg', ['обб', 'обединена българска банка', 'united bulgarian bank']],
    ['postbank', 'Postbank', 'postbank.bg', ['пощенска банка', 'eurobank bulgaria', 'юробанк']],
    ['fibank', 'Fibank', 'fibank.bg', ['first investment bank', 'първа инвестиционна', 'фибанк']],
    ['ccb', 'Central Cooperative Bank', 'ccbank.bg', ['ccbank', 'цкб', 'централна кооперативна']],
    ['procredit', 'ProCredit Bank', 'procreditbank.bg', ['прокредит']],
    ['allianz-bank', 'Allianz Bank Bulgaria', 'bank.allianz.bg', ['алианц банк']],
    ['bacb', 'BACB', 'bacb.bg', ['българо-американска', 'bulgarian-american credit bank']],
    ['investbank', 'Investbank', 'ibank.bg', ['инвестбанк']],
    ['municipal-bank', 'Municipal Bank', 'municipalbank.bg', ['общинска банка']],
    ['tokuda-bank', 'Tokuda Bank', 'tokudabank.bg', ['токуда']],
    ['dbank', 'D Commerce Bank', 'dbank.bg', ['д комерсиална', 'дкб']],
    ['iabank', 'International Asset Bank', 'iabank.bg', ['интернешънъл асет', 'иаб']],
    ['texim-bank', 'Texim Bank', 'teximbank.bg', ['тексим']],
    ['bdb', 'Bulgarian Development Bank', 'bbr.bg', ['ббр', 'българска банка за развитие']],
    ['tbi-bank', 'TBI Bank', 'tbibank.bg', ['tbi', 'тби']],
    ['ing-bg', 'ING Bank Bulgaria', 'ing.bg', ['инг']],
    ['bnp-bg', 'BNP Paribas Bulgaria', 'bnpparibas.bg', ['бнп парибас']],
    ['citibank', 'Citibank', 'citibank.com', ['citi', 'ситибанк']],
    ['icard', 'iCard', 'icard.com', ['ай кард']],
    ['paysera', 'Paysera', 'paysera.bg'],
    ['mypos', 'myPOS', 'mypos.com'],
    ['epay', 'ePay.bg', 'epay.bg', ['epay', 'изипей']],
    ['easypay', 'EasyPay', 'easypay.bg', ['изи пей']],
  ]),

  // ───────────────────────────── Neobanks and payment services ─────────────────────────────
  ...banks(null, 'fintech', [
    ['revolut', 'Revolut', 'revolut.com', ['револют']],
    ['wise', 'Wise', 'wise.com', ['transferwise']],
    ['paypal', 'PayPal', 'paypal.com', ['пейпал']],
    ['n26', 'N26', 'n26.com'],
    ['bunq', 'bunq', 'bunq.com'],
    ['monzo', 'Monzo', 'monzo.com'],
    ['trade-republic', 'Trade Republic', 'traderepublic.com'],
    ['vivid', 'Vivid Money', 'vivid.money'],
    ['skrill', 'Skrill', 'skrill.com'],
  ]),

  // ───────────────────────────── Meal vouchers ─────────────────────────────
  ...banks('BG', 'voucher', [
    ['pluxee', 'Pluxee', 'pluxee.bg', ['sodexo', 'содексо', 'плъкси']],
    ['edenred', 'Edenred', 'edenred.bg', ['едънред', 'ticket restaurant']],
  ]),

  // ───────────────────────────── Banks in Europe (the largest of each country) ─────────────────────────────
  ...banks('AT', 'bank', [
    ['erste-at', 'Erste Bank', 'erstebank.at', ['george', 'sparkasse austria']],
    ['raiffeisen-at', 'Raiffeisen Bank', 'raiffeisen.at'],
    ['bank-austria', 'Bank Austria', 'bankaustria.at'],
  ]),
  ...banks('BE', 'bank', [
    ['kbc', 'KBC', 'kbc.be'],
    ['bnp-fortis', 'BNP Paribas Fortis', 'bnpparibasfortis.be'],
    ['belfius', 'Belfius', 'belfius.be'],
  ]),
  ...banks('HR', 'bank', [
    ['zaba', 'Zagrebačka banka', 'zaba.hr', ['zagrebacka banka']],
    ['pbz', 'PBZ', 'pbz.hr', ['privredna banka zagreb']],
    ['erste-hr', 'Erste Bank Croatia', 'erstebank.hr'],
  ]),
  ...banks('CY', 'bank', [
    ['bank-of-cyprus', 'Bank of Cyprus', 'bankofcyprus.com'],
    ['hellenic-bank', 'Hellenic Bank', 'hellenicbank.com'],
  ]),
  ...banks('CZ', 'bank', [
    ['ceska-sporitelna', 'Česká spořitelna', 'csas.cz', ['ceska sporitelna']],
    ['csob', 'ČSOB', 'csob.cz'],
    ['komercni-banka', 'Komerční banka', 'kb.cz', ['komercni banka']],
  ]),
  ...banks('DK', 'bank', [
    ['danske-bank', 'Danske Bank', 'danskebank.com', ['danske']],
    ['nordea', 'Nordea', 'nordea.com'],
    ['jyske-bank', 'Jyske Bank', 'jyskebank.dk'],
  ]),
  ...banks('EE', 'bank', [
    ['swedbank', 'Swedbank', 'swedbank.com'],
    ['seb', 'SEB', 'seb.se'],
    ['lhv', 'LHV', 'lhv.ee'],
  ]),
  ...banks('FI', 'bank', [['op', 'OP Financial Group', 'op.fi', ['osuuspankki']]]),
  ...banks('FR', 'bank', [
    ['bnp-paribas', 'BNP Paribas', 'mabanque.bnpparibas'],
    ['credit-agricole', 'Crédit Agricole', 'credit-agricole.fr', ['credit agricole']],
    ['societe-generale', 'Société Générale', 'societegenerale.fr', ['societe generale']],
    ['boursobank', 'BoursoBank', 'boursobank.com', ['boursorama']],
  ]),
  ...banks('DE', 'bank', [
    ['sparkasse', 'Sparkasse', 'sparkasse.de'],
    ['deutsche-bank', 'Deutsche Bank', 'deutsche-bank.de'],
    ['commerzbank', 'Commerzbank', 'commerzbank.de'],
    ['ing-de', 'ING Deutschland', 'ing.de', ['ing-diba']],
    ['dkb', 'DKB', 'dkb.de', ['deutsche kreditbank']],
  ]),
  ...banks('GR', 'bank', [
    ['nbg', 'National Bank of Greece', 'nbg.gr', ['εθνική τράπεζα']],
    ['piraeus', 'Piraeus Bank', 'piraeusbank.gr'],
    ['eurobank', 'Eurobank', 'eurobank.gr'],
    ['alpha-bank', 'Alpha Bank', 'alpha.gr'],
  ]),
  ...banks('HU', 'bank', [
    ['otp', 'OTP Bank', 'otpbank.hu'],
    ['kh-bank', 'K&H Bank', 'kh.hu'],
  ]),
  ...banks('IE', 'bank', [
    ['aib', 'AIB', 'aib.ie', ['allied irish banks']],
    ['bank-of-ireland', 'Bank of Ireland', 'bankofireland.com'],
  ]),
  ...banks('IT', 'bank', [
    ['intesa-sanpaolo', 'Intesa Sanpaolo', 'intesasanpaolo.com', ['intesa']],
    ['unicredit', 'UniCredit', 'unicredit.it'],
    ['poste-italiane', 'Poste Italiane', 'poste.it', ['bancoposta']],
  ]),
  ...banks('LV', 'bank', [['citadele', 'Citadele', 'citadele.lv']]),
  ...banks('LT', 'bank', [['luminor', 'Luminor', 'luminor.lt']]),
  ...banks('LU', 'bank', [
    ['spuerkeess', 'Spuerkeess', 'spuerkeess.lu', ['bcee']],
    ['bgl', 'BGL BNP Paribas', 'bgl.lu'],
  ]),
  ...banks('MT', 'bank', [
    ['bov', 'Bank of Valletta', 'bov.com'],
    ['hsbc-mt', 'HSBC Malta', 'hsbc.com.mt'],
  ]),
  ...banks('NL', 'bank', [
    ['ing', 'ING', 'ing.nl'],
    ['rabobank', 'Rabobank', 'rabobank.nl'],
    ['abn-amro', 'ABN AMRO', 'abnamro.nl'],
  ]),
  ...banks('PL', 'bank', [
    ['pko', 'PKO Bank Polski', 'pkobp.pl', ['pko bp']],
    ['pekao', 'Bank Pekao', 'pekao.com.pl'],
    ['mbank', 'mBank', 'mbank.pl'],
  ]),
  ...banks('PT', 'bank', [
    ['cgd', 'Caixa Geral de Depósitos', 'cgd.pt', ['caixa geral']],
    ['millennium', 'Millennium bcp', 'millenniumbcp.pt'],
    ['novo-banco', 'Novo Banco', 'novobanco.pt'],
  ]),
  ...banks('RO', 'bank', [
    ['banca-transilvania', 'Banca Transilvania', 'bancatransilvania.ro', ['bt']],
    ['bcr', 'BCR', 'bcr.ro', ['banca comerciala romana']],
    ['brd', 'BRD', 'brd.ro'],
  ]),
  ...banks('SK', 'bank', [
    ['slsp', 'Slovenská sporiteľňa', 'slsp.sk', ['slovenska sporitelna']],
    ['vub', 'VÚB banka', 'vub.sk', ['vub']],
    ['tatra-banka', 'Tatra banka', 'tatrabanka.sk'],
  ]),
  ...banks('SI', 'bank', [
    ['nlb', 'NLB', 'nlb.si'],
    ['nkbm', 'Nova KBM', 'nkbm.si'],
  ]),
  ...banks('ES', 'bank', [
    ['santander', 'Santander', 'santander.com'],
    ['bbva', 'BBVA', 'bbva.com'],
    ['caixabank', 'CaixaBank', 'caixabank.es', ['la caixa']],
  ]),
  ...banks('SE', 'bank', [['handelsbanken', 'Handelsbanken', 'handelsbanken.se']]),
  ...banks('GB', 'bank', [
    ['barclays', 'Barclays', 'barclays.co.uk'],
    ['hsbc', 'HSBC', 'hsbc.com'],
    ['lloyds', 'Lloyds Bank', 'lloydsbank.com'],
  ]),
  ...banks('CH', 'bank', [
    ['ubs', 'UBS', 'ubs.com'],
    ['postfinance', 'PostFinance', 'postfinance.ch'],
  ]),
  ...banks('NO', 'bank', [
    ['dnb', 'DNB', 'dnb.no'],
    ['sparebank1', 'SpareBank 1', 'sparebank1.no'],
  ]),
  ...banks('RS', 'bank', [
    ['banca-intesa-rs', 'Banca Intesa Beograd', 'bancaintesa.rs'],
    ['aik', 'AIK Banka', 'aikbanka.rs'],
  ]),
  ...banks('MK', 'bank', [
    ['komercijalna', 'Komercijalna banka', 'kb.com.mk'],
    ['stopanska', 'Stopanska banka', 'stb.com.mk'],
  ]),
  ...banks('TR', 'bank', [
    ['ziraat', 'Ziraat Bankası', 'ziraatbank.com.tr', ['ziraat bank']],
    ['isbank', 'İş Bankası', 'isbank.com.tr', ['is bankasi']],
    ['garanti', 'Garanti BBVA', 'garantibbva.com.tr'],
  ]),
  ...banks('UA', 'bank', [
    ['privatbank', 'PrivatBank', 'privatbank.ua'],
    ['monobank', 'monobank', 'monobank.ua'],
  ]),
  ...banks('IS', 'bank', [
    ['landsbankinn', 'Landsbankinn', 'landsbankinn.is'],
    ['arion', 'Arion banki', 'arionbanki.is'],
  ]),

  // ───────────────────────────── Shops and services (Bulgaria first) ─────────────────────────────
  ...shops([
    // Supermarkets
    ['lidl', 'Lidl', 'lidl.bg', ['лидл'], 'food.groceries'],
    ['kaufland', 'Kaufland', 'kaufland.bg', ['кауфланд'], 'food.groceries'],
    ['billa', 'Billa', 'billa.bg', ['била'], 'food.groceries'],
    ['fantastico', 'Fantastico', 'fantastico.bg', ['фантастико'], 'food.groceries'],
    ['t-market', 'T Market', 'tmarket.bg', ['tmarket', 'т маркет', 'т-маркет'], 'food.groceries'],
    ['metro', 'Metro', 'metro.bg', ['метро кеш', 'metro cash'], 'food.groceries'],
    ['cba', 'CBA', 'cba.bg', ['сиби'], 'food.groceries'],
    ['lafka', 'Lafka', 'lafka.bg', ['лафка'], 'food.snacks'],
    // Drugstores, beauty, pharmacies
    ['dm', 'dm', 'dm-drogeriemarkt.bg', ['dm drogerie', 'дм дрогерие'], 'shopping.drugstore'],
    [
      'lilly',
      'Lilly',
      'lillydrogerie.bg',
      ['лили дрогерие', 'lilly drogerie'],
      'shopping.drugstore',
    ],
    ['douglas', 'Douglas', 'douglas.bg', ['дъглас'], 'shopping.cosmetics'],
    ['notino', 'Notino', 'notino.bg', ['нотино'], 'shopping.cosmetics'],
    ['sephora', 'Sephora', 'sephora.com', ['сефора'], 'shopping.cosmetics'],
    ['yves-rocher', 'Yves Rocher', 'yves-rocher.bg', ['ив роше'], 'shopping.cosmetics'],
    ['sopharmacy', 'SOpharmacy', 'sopharmacy.bg', ['софармаси'], 'health.pharmacy'],
    ['subra', 'Subra', 'subra.bg', ['субра'], 'health.pharmacy'],
    ['remedium', 'Remedium', 'remedium.bg', ['ремедиум'], 'health.pharmacy'],
    ['mareshki', 'Mareshki', 'mareshki.bg', ['марешки'], 'health.pharmacy'],
    // Clothes, shoes, sport
    ['lc-waikiki', 'LC Waikiki', 'lcwaikiki.bg', ['waikiki', 'lcw', 'вайкики'], 'shopping.clothes'],
    ['terranova', 'Terranova', 'terranovastyle.com', ['теранова'], 'shopping.clothes'],
    ['hm', 'H&M', 'hm.com', ['h & m', 'hennes'], 'shopping.clothes'],
    ['zara', 'Zara', 'zara.com', ['зара'], 'shopping.clothes'],
    ['bershka', 'Bershka', 'bershka.com', ['бершка'], 'shopping.clothes'],
    [
      'pull-and-bear',
      'Pull&Bear',
      'pullandbear.com',
      ['pull & bear', 'pull and bear', 'pullandbear'],
      'shopping.clothes',
    ],
    ['stradivarius', 'Stradivarius', 'stradivarius.com', ['страдивариус'], 'shopping.clothes'],
    ['massimo-dutti', 'Massimo Dutti', 'massimodutti.com', [], 'shopping.clothes'],
    ['mango', 'Mango', 'mango.com', ['манго'], 'shopping.clothes'],
    ['reserved', 'Reserved', 'reserved.com', ['резервд'], 'shopping.clothes'],
    ['sinsay', 'Sinsay', 'sinsay.com', ['синсей'], 'shopping.clothes'],
    ['mohito', 'Mohito', 'mohito.com', ['мохито'], 'shopping.clothes'],
    ['house', 'House', 'housebrand.com', ['housebrand'], 'shopping.clothes'],
    ['cropp', 'Cropp', 'cropp.com', [], 'shopping.clothes'],
    ['c-and-a', 'C&A', 'c-and-a.com', ['c & a'], 'shopping.clothes'],
    ['new-yorker', 'New Yorker', 'newyorker.de', ['newyorker'], 'shopping.clothes'],
    ['koton', 'Koton', 'koton.com', ['котон'], 'shopping.clothes'],
    ['defacto', 'DeFacto', 'defacto.com', ['de facto'], 'shopping.clothes'],
    ['colins', "Colin's", 'colins.com.tr', ['colins'], 'shopping.clothes'],
    ['calzedonia', 'Calzedonia', 'calzedonia.com', [], 'shopping.clothes'],
    ['intimissimi', 'Intimissimi', 'intimissimi.com', [], 'shopping.clothes'],
    ['tezenis', 'Tezenis', 'tezenis.com', [], 'shopping.clothes'],
    ['benetton', 'United Colors of Benetton', 'benetton.com', ['benetton'], 'shopping.clothes'],
    ['tommy-hilfiger', 'Tommy Hilfiger', 'tommy.com', ['tommy'], 'shopping.clothes'],
    ['guess', 'Guess', 'guess.eu', [], 'shopping.clothes'],
    ['levis', "Levi's", 'levi.com', ['levis'], 'shopping.clothes'],
    ['nike', 'Nike', 'nike.com', ['найк'], 'sport.gear'],
    ['adidas', 'Adidas', 'adidas.com', ['адидас'], 'sport.gear'],
    ['puma', 'Puma', 'puma.com', ['пума'], 'sport.gear'],
    ['skechers', 'Skechers', 'skechers.com', [], 'shopping.shoes'],
    ['deichmann', 'Deichmann', 'deichmann.com', ['дайхман'], 'shopping.shoes'],
    ['ccc', 'CCC', 'ccc.eu', [], 'shopping.shoes'],
    ['humanic', 'Humanic', 'humanic.net', [], 'shopping.shoes'],
    ['decathlon', 'Decathlon', 'decathlon.bg', ['декатлон'], 'sport.gear'],
    ['sport-depot', 'Sport Depot', 'sportdepot.bg', ['спорт депо', 'sportdepot'], 'sport.gear'],
    ['sportisimo', 'Sportisimo', 'sportisimo.bg', ['спортисимо'], 'sport.gear'],
    ['pepco', 'Pepco', 'pepco.bg', ['пепко'], 'shopping.home_decor'],
    ['kik', 'KiK', 'kik.bg', ['кик'], 'shopping.clothes'],
    ['answear', 'Answear', 'answear.bg', [], 'shopping.clothes'],
    ['fashion-days', 'Fashion Days', 'fashiondays.bg', ['fashiondays'], 'shopping.clothes'],
    ['pandora', 'Pandora', 'pandora.net', ['пандора'], 'shopping.jewelry'],
    ['swarovski', 'Swarovski', 'swarovski.com', [], 'shopping.jewelry'],
    // Electronics and telecoms
    ['technopolis', 'Technopolis', 'technopolis.bg', ['технополис'], 'shopping.electronics'],
    ['technomarket', 'Technomarket', 'technomarket.bg', ['техномаркет'], 'shopping.electronics'],
    ['zora', 'Zora', 'zora.bg', ['зора'], 'shopping.electronics'],
    ['ardes', 'Ardes', 'ardes.bg', ['ардес'], 'shopping.computers'],
    ['emag', 'eMAG', 'emag.bg', ['емаг'], 'shopping.online'],
    ['xiaomi', 'Xiaomi', 'mi.com', ['mi store', 'шаоми', 'сяоми'], 'shopping.electronics'],
    ['samsung', 'Samsung', 'samsung.com', ['самсунг'], 'shopping.electronics'],
    ['apple', 'Apple', 'apple.com', ['apple.com/bill', 'itunes', 'епъл'], 'digital.software'],
    ['a1', 'A1', 'a1.bg', ['а1', 'mtel', 'мтел'], 'communication.mobile'],
    ['yettel', 'Yettel', 'yettel.bg', ['йетел', 'telenor', 'теленор'], 'communication.mobile'],
    ['vivacom', 'Vivacom', 'vivacom.bg', ['виваком'], 'communication.mobile'],
    // Books, toys, home
    [
      'orange-center',
      'Orange Center',
      'orangecenter.bg',
      ['orange', 'ориндж', 'ориндж център'],
      'shopping.books',
    ],
    ['helikon', 'Helikon', 'helikon.bg', ['хеликон'], 'shopping.books'],
    ['ciela', 'Ciela', 'ciela.com', ['сиела'], 'shopping.books'],
    ['ozone', 'Ozone', 'ozone.bg', ['озон'], 'shopping.online'],
    ['hippoland', 'Hippoland', 'hippoland.net', ['хиполенд'], 'kids.toys'],
    ['jumbo', 'Jumbo', 'jumbo.bg', ['джъмбо'], 'shopping.toys'],
    ['ikea', 'IKEA', 'ikea.bg', ['икеа'], 'shopping.furniture'],
    ['jysk', 'JYSK', 'jysk.bg', ['юск', 'йоск'], 'shopping.furniture'],
    ['praktiker', 'Praktiker', 'praktiker.bg', ['практикер'], 'shopping.tools'],
    [
      'mr-bricolage',
      'Mr. Bricolage',
      'mr-bricolage.bg',
      ['mr bricolage', 'бриколаж'],
      'shopping.tools',
    ],
    ['homemax', 'HomeMax', 'homemax.bg', ['home max', 'хоум макс'], 'shopping.home_decor'],
    ['aiko', 'Aiko', 'aiko.bg', ['айко'], 'shopping.furniture'],
    ['videnov', 'Mebeli Videnov', 'videnov.bg', ['videnov', 'виденов'], 'shopping.furniture'],
    // Restaurants and coffee
    ['mcdonalds', "McDonald's", 'mcdonalds.bg', ['mcdonalds', 'макдоналдс'], 'food.fast_food'],
    ['kfc', 'KFC', 'kfc.bg', ['кфс'], 'food.fast_food'],
    ['burger-king', 'Burger King', 'burgerking.bg', ['бургер кинг'], 'food.fast_food'],
    ['subway', 'Subway', 'subway.com', [], 'food.fast_food'],
    ['dominos', "Domino's Pizza", 'dominos.bg', ['dominos', 'доминос'], 'food.fast_food'],
    ['happy', 'Happy Bar & Grill', 'happy.bg', ['хепи'], 'food.restaurants'],
    ['starbucks', 'Starbucks', 'starbucks.com', ['старбъкс'], 'food.cafe'],
    ['costa', 'Costa Coffee', 'costa.co.uk', ['costa'], 'food.cafe'],
    ['tchibo', 'Tchibo', 'tchibo.bg', ['чибо'], 'food.cafe'],
    ['glovo', 'Glovo', 'glovoapp.com', ['глово'], 'food.delivery'],
    ['foodpanda', 'foodpanda', 'foodpanda.bg', ['фудпанда'], 'food.delivery'],
    ['wolt', 'Wolt', 'wolt.com', ['волт'], 'food.delivery'],
    // Fuel and transport
    ['shell', 'Shell', 'shell.bg', ['шел'], 'vehicle.fuel'],
    ['omv', 'OMV', 'omv.bg', ['омв'], 'vehicle.fuel'],
    ['lukoil', 'Lukoil', 'lukoil.bg', ['лукойл'], 'vehicle.fuel'],
    ['petrol', 'Petrol', 'petrol.bg', ['петрол'], 'vehicle.fuel'],
    ['eko', 'EKO', 'eko.bg', ['еко'], 'vehicle.fuel'],
    ['rompetrol', 'Rompetrol', 'rompetrol.bg', ['ромпетрол'], 'vehicle.fuel'],
    ['bolt', 'Bolt', 'bolt.eu', ['болт'], 'transport.taxi'],
    ['uber', 'Uber', 'uber.com', ['убер'], 'transport.taxi'],
    ['bdz', 'BDZ', 'bdz.bg', ['бдж', 'bdz passenger'], 'transport.train'],
    ['wizz-air', 'Wizz Air', 'wizzair.com', ['wizzair', 'уиз еър'], 'travel.flights'],
    ['ryanair', 'Ryanair', 'ryanair.com', ['райънеър'], 'travel.flights'],
    ['bulgaria-air', 'Bulgaria Air', 'air.bg', ['българия еър'], 'travel.flights'],
    ['booking', 'Booking.com', 'booking.com', ['booking'], 'travel.accommodation'],
    ['airbnb', 'Airbnb', 'airbnb.com', [], 'travel.accommodation'],
    ['speedy', 'Speedy', 'speedy.bg', ['спиди'], 'communication.postal'],
    ['econt', 'Econt', 'econt.com', ['еконт'], 'communication.postal'],
    ['boxnow', 'BOX NOW', 'boxnow.bg', ['box now'], 'communication.postal'],
    // Bills
    [
      'electrohold',
      'Electrohold',
      'electrohold.bg',
      ['електрохолд', 'cez', 'чез'],
      'utilities.electricity',
    ],
    ['evn', 'EVN', 'evn.bg', ['евн'], 'utilities.electricity'],
    [
      'energo-pro',
      'Energo-Pro',
      'energo-pro.bg',
      ['енерго про', 'енерго-про'],
      'utilities.electricity',
    ],
    ['toplofikacia-sofia', 'Toplofikacia Sofia', 'toplo.bg', ['топлофикация'], 'utilities.heating'],
    ['sofiyska-voda', 'Sofiyska voda', 'sofiyskavoda.bg', ['софийска вода'], 'utilities.water'],
    ['overgas', 'Overgas', 'overgas.bg', ['овергаз'], 'utilities.gas'],
    // Subscriptions, online shops, entertainment
    ['netflix', 'Netflix', 'netflix.com', ['нетфликс'], 'digital.video_streaming'],
    ['spotify', 'Spotify', 'spotify.com', ['спотифай'], 'digital.music_streaming'],
    ['youtube', 'YouTube', 'youtube.com', ['youtube premium'], 'digital.video_streaming'],
    [
      'disney-plus',
      'Disney+',
      'disneyplus.com',
      ['disney plus', 'disney+'],
      'digital.video_streaming',
    ],
    ['hbo-max', 'HBO Max', 'hbomax.com', ['max.com', 'hbo'], 'digital.video_streaming'],
    ['google', 'Google', 'google.com', ['google play', 'google one'], 'digital.software'],
    ['microsoft', 'Microsoft', 'microsoft.com', ['xbox', 'office 365'], 'digital.software'],
    ['steam', 'Steam', 'steampowered.com', ['valve'], 'digital.games'],
    ['playstation', 'PlayStation', 'playstation.com', ['psn', 'sony interactive'], 'digital.games'],
    ['openai', 'ChatGPT', 'openai.com', ['openai', 'chatgpt'], 'digital.ai'],
    ['amazon', 'Amazon', 'amazon.com', ['amzn', 'amazon prime'], 'shopping.online'],
    ['temu', 'Temu', 'temu.com', ['тему'], 'shopping.online'],
    ['aliexpress', 'AliExpress', 'aliexpress.com', ['али експрес'], 'shopping.online'],
    ['shein', 'Shein', 'shein.com', ['шийн'], 'shopping.clothes'],
    ['cinema-city', 'Cinema City', 'cinemacity.bg', ['синема сити'], 'entertainment.cinema'],
    [
      'kino-arena',
      'Kino Arena',
      'kinoarena.com',
      ['кино арена', 'arena cinemas'],
      'entertainment.cinema',
    ],
    ['multisport', 'Multisport', 'multisport.bg', ['мултиспорт'], 'sport.gym'],
    ['pulse-fitness', 'Pulse Fitness', 'pulsefit.bg', ['пулс фитнес'], 'sport.gym'],
  ]),
];

const BY_ID = new Map(BRAND_LIST.map((b) => [b.id, b]));

export function brandById(id: string): BrandInfo | undefined {
  return BY_ID.get(id);
}

/** Lower case, without accents, separators turned into spaces. */
export function normalizeBrandText(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}&+]+/gu, ' ')
    .trim();
}

interface Matcher {
  brand: BrandInfo;
  /** Normalised spellings, longest first. */
  terms: string[];
}

/**
 * Names that are also ordinary words: they only match the whole payee or its first word
 * ("House" the shop, not "Coffee House").
 */
const GENERIC = new Set([
  'house',
  'happy',
  'guess',
  'mango',
  'jumbo',
  'metro',
  'petrol',
  'orange',
  'apple',
  'puma',
  'zora',
  'costa',
  'reserved',
  'ozone',
  'subway',
  'bolt',
  'shell',
  'booking',
  'temu',
  'wise',
  'vivid',
  'nike',
  'google',
  'amazon',
  'steam',
  'lafka',
  'helikon',
  'speedy',
  'subra',
  'remedium',
  'notino',
  'cropp',
  'koton',
  'mohito',
  'sinsay',
  'colins',
  'douglas',
  'pandora',
  'eurobank',
  'citadele',
  'luminor',
  'nordea',
  'seb',
  'swedbank',
  'sparkasse',
  'santander',
  'арена',
  'зора',
  'метро',
  'петрол',
  'хепи',
  'озон',
  'пума',
  'лафка',
  'спиди',
]);

let matchers: Matcher[] | null = null;
function allMatchers(): Matcher[] {
  matchers ??= BRAND_LIST.map((b) => ({
    brand: b,
    terms: [...new Set([b.name, ...(b.aliases ?? [])].map(normalizeBrandText))]
      .filter((t) => t.length >= 2)
      .sort((x, y) => y.length - x.length),
  }));
  return matchers;
}

const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);

/** Whether `term` appears in `text` as whole word(s). */
function containsWord(text: string, term: string): boolean {
  for (let i = text.indexOf(term); i !== -1; i = text.indexOf(term, i + 1)) {
    if (!isWordChar(text[i - 1]) && !isWordChar(text[i + term.length])) return true;
  }
  return false;
}

/**
 * The shop or service a payee is (also "LIDL BULGARIA EOOD", "Лидл", "Kaufland 1234 Sofia").
 * Terms of two or three letters ("dm", "A1") only match the whole payee or its first word.
 */
export function recognizeBrand(payee: string | null | undefined): BrandInfo | undefined {
  if (!payee) return undefined;
  const text = normalizeBrandText(payee);
  if (!text) return undefined;
  let best: { brand: BrandInfo; length: number } | undefined;
  for (const m of allMatchers()) {
    for (const term of m.terms) {
      const short = term.length <= 3 || GENERIC.has(term);
      const hit = short ? text === term || text.startsWith(`${term} `) : containsWord(text, term);
      if (hit && (!best || term.length > best.length))
        best = { brand: m.brand, length: term.length };
      if (hit) break;
    }
  }
  return best?.brand;
}

/** Brands whose name or alias starts with what was typed (for payee suggestions). */
export function searchBrands(typed: string, limit = 6): BrandInfo[] {
  const q = normalizeBrandText(typed);
  if (q.length < 2) return [];
  const starts: BrandInfo[] = [];
  const inside: BrandInfo[] = [];
  for (const m of allMatchers()) {
    if (m.terms.some((t) => t.startsWith(q))) starts.push(m.brand);
    else if (m.terms.some((t) => t.includes(` ${q}`))) inside.push(m.brand);
  }
  return [...starts, ...inside].slice(0, limit);
}
