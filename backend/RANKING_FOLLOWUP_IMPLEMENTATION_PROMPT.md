# Rangsor – feldolgozás, reset, újrapontozás és emberi döntési workflow javítása

## Szerep és cél

Senior full-stack fejlesztőként fejleszd tovább az InnovationLab Dashboard Rangsor oldalát. A meglévő audit-, jogosultság-, strukturált AI- és verziókezelési elveket tartsd meg. A fejlesztés backend-, frontend-, adatbázis- és tesztszinten legyen teljes.

## Bizonyított kiinduló állapot

- A 12 aktuális technikai hiba mind a `PRESCREEN` fázisban keletkezett `ValidationError`; 11 ugyanazon teljes újraértékelési batch eredménye.
- A kézi `RESCORE_ALL` tényleges súlyváltozás nélkül is kétszer új konfigurációt hozott létre.
- A `SZRTIL-410` címe az adatforrás `Összefoglalás` mezőjében rendelkezésre áll, de a régi v1 prescreen migrációja csak az azonosítót mentette.
- A minden rekordnál azonos pontosítási kérdések legacy migrációs statikus szövegek, nem kontextusfüggő v2 AI-válaszok.
- Súlyváltozás és aktívkritérium-változás nem azonos: az aktív kritériumok körének módosítása továbbra is módszertani változás.

## 1. Részletes kezdeti feldolgozási kimutatás

A Feldolgozási összesítő „Új ötletek feldolgozása” részében jelenjen meg:

- összes jogosult ötlet;
- sikeresen feldolgozott ötlet;
- hátralévő ötlet;
- még el sem kezdett új ötlet;
- technikai hibás ötlet;
- százalékos progress és vizuális progress bar;
- batch méret, feldolgozás és hibák újrapróbálása.

A számlálás egyedi ötletazonosítók alapján történjen, ugyanaz az ötlet ne számítson kétszer.

## 2. Teljes újrakezdés

Készüljön külön `reset` jogosultsághoz kötött, kétlépcsős megerősítésű „Minden értékelés törlése és újrakezdés” művelet.

- Törölje az operatív `idea_processing`, `prescreen_results`, `evaluations` és `prescreen_overrides` adatokat.
- Állítsa vissza az üres manuális rangsort és növelje a rangsorverziót.
- Az aktuális kritériumkonfigurációt és súlyokat ne törölje.
- Az auditnaplót ne törölje; mentse a törölt elemszámokat, a végrehajtót, indoklást és időpontot.
- A művelet tranzakciós legyen: részleges törlés nem maradhat.
- A megerősítő szöveg pontosan `TELJES ÚJRAKEZDÉS` legyen.
- Siker után minden feldolgozási számláló 0-ról induljon, az összes jogosult ötlet hátralévő/új legyen.

## 3. Súlyalapú újrapontozás

- Súlymódosítás mentésekor először `WEIGHTS_PENDING` konfiguráció készüljön ugyanazzal a `criteriaVersion` és `scoringVersion` értékkel, így a meglévő rangsor az újrapontozásig sem tűnik el.
- A feldolgozási összesítő újrapontozási gombja csak függő `WEIGHTS_PENDING` állapotban legyen aktív.
- A backend utasítsa el az újrapontozást, ha nincs tényleges függő súlyváltozás.
- Újrapontozáskor AI-hívás nélkül készüljenek immutable értékelési másolatok új `scoringVersion` értékkel.
- A nyers kritériumpontok és indoklások maradjanak változatlanok; csak a súlyozott hozzájárulás, összpontszám és rangsor változzon.
- A sikeres művelet új konfiguráció- és rangsorverziót hozzon létre, majd szüntesse meg a pending állapotot.
- Aktív kritérium ki-/bekapcsolása továbbra is `CRITERIA_MEANING`, teljes újraértékelést igényel, és ne használja újra a régi részpontszámokat.

## 4. Emberi döntési workflow és indexelés

Az AI-javaslat és az emberi döntés külön mező maradjon. A frontend szekciók a tényleges workflow-állapot alapján szűrjenek.

- Döntés nélküli `CLOSE_RECOMMENDED` → „Lezárásra javasolt”.
- `CLOSE_RECOMMENDED` + `ACCEPT_RECOMMENDATION` → „Lezárandó”.
- Döntés nélküli `NEEDS_CLARIFICATION` → „Pontosítandó”.
- `NEEDS_CLARIFICATION` + `ACCEPT_RECOMMENDATION` → „Pontosításra visszaküldendő”.
- `requiresHumanReview=true` csak emberi döntés nélkül jelenjen meg a függő emberi felülvizsgálati szekcióban.
- `ALLOW_SCORING` után az ötlet ne jelenjen meg egyik függő beavatkozási listában sem; sikeres pontozás után kerüljön a rangsorba.
- A technikai hibák a sikertelen szekcióban maradjanak és legyenek újrapróbálhatók.
- Az összesítő függő és elfogadott számai a fenti workflow-állapotot kövessék.

## 5. Kapcsolódó ötlet címe

- A tárolt `relatedIdeaTitle` hiányában az API oldja fel a címet az aktuális normalizált forrásrekord `cim` mezőjéből, kis-/nagybetűtől független azonosító-egyezéssel.
- A frontend soha ne írjon „Cím nem állapítható meg” szöveget, ha az adatforrásban a cím elérhető.
- Új AI-válasznál a kapcsolódó azonosító csak a megadott jelöltekből jöhet; a végleges címet mindig az autoritatív jelölt rekordból normalizáld.

## 6. Duplikált státuszcímkék

Egy kártyán ugyanaz az üzleti státusz csak egyszer jelenjen meg. Ne rendereld egymás mellett a döntésből és a `status` mezőből származó azonos „Lezárásra javasolt” vagy „Pontosítandó” badge-et.

## 7. Kontextusfüggő pontosítás és AI-validáció

- Az új v3 AI-prompt írja elő, hogy minden pontosítási kérdés az adott ötlet konkrét problémájára, céljára, érintettjére, megoldására vagy elvárt eredményére hivatkozzon.
- Tiltsd az általános „Adjon meg több információt” és a legacy „Mely konkrét tény vagy szakértői állásfoglalás…” sablonokat.
- A kérdések legyenek egyediek, kérdőjellel záródjanak és továbbra is 1–3 darabosak legyenek.
- Strukturált prescreen-validációs hiba esetén legfeljebb egyszer próbáld újra az AI-hívást a biztonságosan kivonatolt validációs hibakódokkal és a séma szabályainak megismétlésével.
- A retry ne használjon statikus üzleti döntési fallbacket.
- Sikertelen második kísérletnél az audit csak biztonságos validációs helyet/típust tároljon, ötletszöveget vagy titkot ne.
- A legacy statikus kérdéseket jelöld újraértékelendőnek; ne állítsd be őket új, kontextusfüggő AI-kérdésként.

## 8. API és jogosultság

- Új `POST /api/ranking/reset-all` végpont `reset` jogosultsággal.
- A status API adjon `initialProcessing` és `weightRescore` objektumot.
- A prescreen API adjon explicit `workflowState` értéket és autoritatívan feloldott kapcsolódó címet.
- Read-only módban a reset, újrapontozás és minden mutáció 403 legyen még AI- vagy adatbázisművelet előtt.

## 9. Kötelező tesztek

- feldolgozott/hátralévő/új/hibás számlálás;
- reset után 0 feldolgozott, minden jogosult ötlet új, rangsor üres;
- reset auditot megtart, konfigurációt nem töröl, jogosultság nélkül 403;
- súlymentéskor a rangsor nem tűnik el és rescore pending lesz;
- rescore csak pending súlyváltozásnál fut, AI-hívás nélkül;
- rescore után minden kompatibilis ötlet megmarad és újrarangsorolódik;
- aktív kritérium változása nem minősül súly-only változásnak;
- elfogadott lezárás és pontosítás a megfelelő új szekcióba kerül;
- továbbengedett ötlet eltűnik a függő listából és rangsorolódik;
- emberi felülvizsgálat nem duplikálja a számlálást;
- forrásból feloldódik a `SZRTIL-410` címhez hasonló legacy kapcsolat;
- nincs duplikált státuszbadge;
- pontosítási kérdések nem lehetnek tiltott statikus sablonok;
- első strukturált validációs hiba után egy retry történik, második hiba részletes, biztonságos auditot hoz létre;
- tesztekben minden AI-hívás mockolt, valódi AI-hívás tilos.

## 10. Átadás

Futtasd a teljes backend- és frontendteszteket, Python formatter/compile ellenőrzést és production buildet. A valós 12 hibás ötletet ne próbáld újra automatikusan; csak read-only módon diagnosztizáld, és a javítás telepítése után a jogosult felhasználó dönthessen az újrapróbálásról.
