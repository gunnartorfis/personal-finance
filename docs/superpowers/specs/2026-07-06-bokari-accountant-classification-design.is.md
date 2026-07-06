# Bókari — flokkunar- og afstemmingartól fyrir bókhaldsstofur (hönnunarskjal)

Dagsetning: 6. júlí 2026
Staða: samþykkt hönnun, útfærsla ekki hafin

> Íslensk útgáfa af `2026-07-06-bokari-accountant-classification-design.md`.
> Enska útgáfan er viðmiðunarskjalið ef texta ber ekki saman.

## Samantekt

B2B-hluti innan fjármálaappsins, ætlaður íslenskum bókhalds- og
endurskoðunarstofum, með tveimur einingum sem deila einni vél:

1. **Flokkun**: bankayfirlit viðskiptavina eru lesin inn (CSV/Excel),
   gervigreind forflokkar hverja færslu á **bókhaldslykla stofunnar
   sjálfrar** ásamt tillögu að VSK-meðferð, bókari yfirfer og leiðréttir í
   hraðvirkri yfirferðartöflu (lyklaborðsdrifin), og niðurstaðan er flutt
   út sem CSV/Excel til innlestrar í dk, Payday eða Reglu.
2. **Afstemming**: bankayfirlit + hreyfingalisti úr bókhaldskerfinu
   (dk/Payday/Regla) eru lesin inn, og gervigreindarstudd pörun skilar:
   pöruðum færslum, í-banka-ekki-í-bókhaldi og í-bókhaldi-ekki-í-banka.
   Staðfestur sársaukapunktur hjá tilraunastofunni.

Bókari er **forvinnslutól, ekki bókhaldskerfi**: engin tvíhliða færsla,
engir stöðureikningar. Vinnuheiti — endanlegt nafn ákveðið fyrir útgáfu.

## Markmið og rök

- Aðalmarkmið: tekjur sem fyrst (valið fram yfir fjármögnunarsögu).
- Íslenskir neytendur borga ekki fyrir heimilisfjármálaöpp (ókeypis
  bankaöpp og Meniga-arfleifðin hafa fest „frítt" í sessi), svo
  B2C-áskrift er veikasta tekjuleiðin. Stofur borga hins vegar fyrir
  raunverulegan sársauka: flokkun færslna er tímafrek handavinna sem étur
  framlegð hjá stofum sem rukka ~15–25 þús. kr./klst., og afstemming er
  staðfestur stór sársaukapunktur hjá tilraunastofunni — sterkasta
  eftirspurnarmerkið sem við höfum.
- Endurnýtir tvo verðmætustu hluta kóðagrunnsins nánast óbreytta:
  sjálfvirka CSV-innlesturinn (ADR-0018) og gervigreindarflokkun með
  skyndiminni (ADR-0005, ADR-0012).

## Viðskiptaáætlun

- **Tilraunaverkefni (pilot)**: ein stofa gegnum persónuleg tengsl,
  ókeypis í 2 mánuði. Árangur = stofan keyrir ≥ 3 raunverulega
  viðskiptavini í gegnum flokkun OG notar afstemmingu á raunverulega
  mánuði, hlutfall sjálfsamþykktra færslna hækkar merkjanlega milli
  mánaðar 1 og 2, og stofan vill frekar borga en missa tólið.
- **Verðlagning eftir tilraun**: mánaðargjald á hvern viðskiptavin
  stofunnar, stærðargráðan ~1.500 kr./viðskiptavin/mán.; ekkert gjald á
  notanda. Tilraunin stillir verðið af.
- **Varnarmúr / lærdómslykkja**: hver leiðrétting skrifast í skyndiminni
  stofunnar: seljandi → (bókhaldslykill, VSK-kóði). Mánuður 2 krefst
  miklu minni yfirferðar en mánuður 1. Hækkandi sjálfsamþykktarhlutfall
  er bæði virði vörunnar og sölurökin.

## Vörumerki: sérstakt vörumerki, sameiginlegur kóðagrunnur

- **Sérstakt vörumerki**: eigið nafn, lén og kynningarsíða. Bókari sem
  kaupandi má aldrei lenda á markaðsefni um heimilisfjármál para; tónn og
  verðsíða eru B2B. Heldur B2C-sögunni líka hreinni.
- **Sameiginlegur kóðagrunnur**: endurnýtingin er allur efnahagslegi
  grundvöllurinn (CSV-innlestur, flokkunarvél + skyndiminni, þýðingakerfi,
  auðkenning, greiðslukerfi, aðgerðaskrá). Að skilja þetta að í sér
  kóðagrunn kostaði vikur áður en fyrsta yfirlitið væri unnið.
- **Tæknileg útfærsla**: annað lén á sama Vercel-verkefni; beining eftir
  hýsilnafni í middleware (`bokari.is` → stofuviðmót, fjármálalénið →
  heimilisapp). Hvort lén sér aðeins sitt eigið markaðsefni og innskráningu.
- **Skilyrði fyrir aðskilnaði**: aðeins flutt í eigið verkefni ef tilraunin
  skilar borgandi viðskiptavinum og Bókari verður tekjuvélin. Einangrun
  stofugagna (aðskildar töflur, engin tenging við heimili) gerir þann
  flutning einfaldan.
- **Kostnaður sem við sættum okkur við á meðan**: sameiginlegar útgáfur —
  villa í heimilisappinu getur tafið Bókara-útgáfu og öfugt. Í lagi á
  tilraunaskala.

## Aðgangsskipulag og gagnalíkan

- Ný tegund leigjanda: `Stofa` (Firm), hliðstæð Heimili (í anda ADR-0002,
  engin samfléttun). Stigveldi: Stofa → Notendur (bókarar) →
  Viðskiptavinir → Reikningar.
- Aðskildar töflur frá heimilisfærslum; sama viðbótar-eingöngu og
  tvítökuvarða innlestrarmynstur (ADR-0003).
- Sami notandi má tilheyra bæði Heimili og Stofu — aðskildar
  aðildartöflur, engin víxlverkun.
- **Bókhaldslyklar**: hlaðið upp einu sinni fyrir stofu sem CSV
  (lykilnúmer, heiti, valfrjáls sjálfgefinn VSK-kóði); má yfirskrifa fyrir
  einstaka viðskiptavini. Upphleðslan fer í gegnum sama
  dálkapörunarviðmót og yfirlitin.
- **Mótreikningur**: fastur bókhaldslykill á hverjum Reikningi, stilltur
  einu sinni, birtist sem dálkur í útflutningi.

## Endurnýtt í heild

- Sjálfvirkur CSV-innlestur: dálkapörun, þumalputtareglur,
  gervigreindar-varaleið, munaðar paranir eftir skráarsniði (ADR-0018).
  Snið hvers banka er kennt einu sinni, síðan les það sig sjálft inn.
- Bakgrunnsflokkun + Sonnet gegnum AI Gateway (ADR-0005).
- Seljandaskyndiminni (ADR-0012), endursniðið sem
  `(stofa, seljandi) → bókhaldslykill + VSK-kóði`.
- Þýðingakerfi (bæði tungumál, skv. CLAUDE.md), Neon Auth,
  Straumur-greiðslur (tengt eftir tilraun), aðgerðaskrá.

## Nýir hlutar

1. **Bókhaldslyklaskrá + upphleðsluflæði** — endurnýtir pörunarviðmótið;
   geymir lykilnúmer, heiti, sjálfgefinn VSK.
2. **Yfirferðartafla** (kjarnaskjár vörunnar) — lyklaborðsdrifin tafla
   yfir flokkaðar færslur yfirlits. Aðgerðir: samþykkja færslu, leiðrétta
   lykil (innsláttarleit í lyklaskránni), leiðrétta VSK, magnsamþykkja
   allar færslur seljanda. Færslur með háu öryggi koma forsamþykktar;
   færslur með lágu öryggi koma merktar. Hver leiðrétting skrifast í
   skyndiminni stofunnar.
3. **Útflutningur** — CSV/Excel með dálkunum: dagsetning,
   skýring/seljandi, upphæð, lykilnúmer, heiti lykils, VSK-kóði,
   mótreikningur, athugasemd. Útflutningur leyfður hvenær sem er;
   óafgreiddar merkingar birtast sem viðvaranir, ekki hindranir.
4. **Afstemmingareining** — önnur skráartegund á hvern Reikning:
   hreyfingalisti úr bókhaldskerfinu (dk/Payday/Regla), lesinn inn með
   sömu pörunarvél (munaðar paranir eftir útflutningssniði hvers kerfis).
   Pörunarkeyrsla parar bankafærslur við bókhaldsfærslur: fyrst
   reglubundið (nákvæm upphæð + dagsetningargluggi + tilvísun), síðan með
   gervigreind á afganginn (skiptar greiðslur, hliðraðar dagsetningar,
   búntaðar kortauppgjörsfærslur — þar sem raunverulegi sársaukinn býr).
   Útkoman: **pörunaryfirferðartafla** (sama töflumynstur) með þremur
   flokkum — parað, í-banka-ekki-í-bókhaldi, í-bókhaldi-ekki-í-banka —
   þar sem bókarinn staðfestir eða rýfur paranir, auk útflutningshæfrar
   frávikaskýrslu. Staðfestar pörunarreglur vistast í skyndiminni
   stofunnar líkt og flokkunarleiðréttingar.

## Flæði

Flokkun: stofa stofnuð → viðskiptavini bætt við → lyklaskrá hlaðið upp →
yfirliti hlaðið upp → bakgrunnsflokkun (skyndiminni stofunnar fyrst,
gervigreind til vara með lyklaskrána í fyrirmælunum) → yfirferðartafla →
útflutningur.

Afstemming: yfirliti hlaðið upp (sama og áður) + hreyfingalista hlaðið
upp → pörunarkeyrsla (reglubundin, síðan gervigreind á afganginn) →
pörunaryfirferðartafla → frávikaskýrsla.

## Flokkun

- Skyndiminni hittir → nota geymdan lykil + VSK, merkt með háu öryggi.
- Skyndiminni missir → gervigreindarkall með gildandi lyklaskrá
  viðskiptavinar (sérskrá viðskiptavinar, annars skrá stofu) í
  fyrirmælunum; skilar lykli + VSK + öryggismati.
- Gervigreind bregst → færslan lendir merkt-óflokkuð; innlestur stöðvast
  aldrei.
- Ekkert fer út sem „gervigreindin ákvað" án þess að yfirferðartaflan hafi
  sýnt það — hver tillaga er yfirferðarhæf.

## Utan umfangs í fyrstu útgáfu (skýrt afmarkað)

- Engin bein API-tenging við dk/Payday/Reglu (útgáfa 2; tilraunin segir
  okkur hvaða kerfi) — afstemming í fyrstu útgáfu er CSV-á-móti-CSV, ekki
  lifandi bókhald.
- Engin afstemming á stöðum (upphafs-/lokastöðuprófun) — aðeins pörun
  einstakra færslna; stöður krefjast hlaupandi stöðu bókhaldsmegin
  (útgáfa 2).
- Enginn PDF-lestur — aðeins CSV/Excel-yfirlit.
- Engin fylgiskjöl/kvittanir, engin bankatenging, engin tvíhliða færsla.
- Enginn gjaldeyrir — aðeins skuldfærðar ISK-upphæðir.
- Engin sjálfvirk gjaldtaka — tilraunin er ókeypis; Straumur tengdur
  eftir að tilraunin skilar sér.

## Villumeðhöndlun

- Gölluð lyklaskrá/yfirlitsskrá → sama stopp-og-laga forskoðunarmynstur
  og í heimilisappinu.
- Endurteknar upphleðslur tvítökuvarðar (ADR-0003 mynstur).
- Bilun í gervigreind/þjónustu leiðir til merktra-óflokkaðra færslna,
  aldrei stöðvaðs innlestrar.

## Prófanir

- Samanburðarskrár (golden files) fyrir útflutning og frávikaskýrsluna.
- Einingaprófanir: flokkunarpörun (skyndiminnishittur,
  gervigreindar-varaleið), innsláttarleit í lyklaskrá, meðhöndlun
  VSK-tillagna; reglubundna pörunarvélin (upphæð/dagsetningargluggi/
  tilvísun, skiptar greiðslur, búntuð uppgjör) með prófgögnum af
  yfirlits- og hreyfingalistapörum.
- `renderWithIntl` fyrir töfluviðmótið; TypeScript þarf að þýðast
  villulaust (almenn regla).
- Tilraunin er raunprófunin; mælt er hlutfall sjálfsamþykktra færslna og
  leiðréttingar á hverjar 100 færslur (flokkun), hlutfall sjálfparaðra
  færslna og handvirkar pörunaraðgerðir á hverjar 100 færslur
  (afstemming), mánuður 1 á móti mánuði 2.

## Óútkljáðar spurningar

- Endanlegt nafn + lén (Bókari er vinnuheiti).
- Bókhaldskerfi tilraunastofunnar (dk/Payday/Regla?) — ræður
  samþættingarmarkmiði útgáfu 2, nákvæmum dálkakröfum útflutnings og
  sniði hreyfingalistans sem pörunarvélin þarf að lesa.
- Hvort skiptir stofuna meira máli, flokkun eða afstemming? — ræður
  smíðaröð innan fyrstu útgáfu.
- VSK-jaðartilvik sem skipta stofuna máli (öfug skattskylda, seljendur
  með blönduð þrep) — safnað í tilrauninni, ekki forsmíðað.
