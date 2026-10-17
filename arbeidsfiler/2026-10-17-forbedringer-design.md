# Immich Widget 1.1 – forbedringer (design, 2026-10-17)

Godkjent av Ray i chat 17.10. Krever Immich ≥ 3.2 (nytt `filter` i søk).

## Bildeutvalg
- Knapp «Hent personer, album og tagger fra Immich» fyller tre avkrysningslister (Cinnamon `list`, kolonner Vis/Navn). Ingen avkrysset = alle. Avkrysset = hvem/hvilket som helst (`filter.personIds.any` osv.). Navn slås opp til ID ved hver henting.
- Filtre (alle virker sammen): bare favoritter, minst X stjerner (`rating.gte`), tidsrom (alle / siste 12 mnd / siste 5 år / fra–til år, `takenAt`), steder (by eller land, kommaskilt, `or[city.in, country.in]`), innholdssøk (`/search/smart`), skjermbilder av/på (`make.ne null`).
- «På denne dagen»: `/memories?for=<i dag>&type=on_this_day`; ingen treff → vanlig utvalg. Hentes på nytt rett over midnatt.
- Høyreklikk: «Merk som favoritt / Fjern fra favoritter» (`PUT /assets/{id}`), «Ikke vis dette bildet igjen» (lokal svarteliste i innstillingene).
- Pause når musa er over (alltid).

## Tilganger (API-nøkkel)
- Innstillingsfeltet «Tilganger nøkkelen trenger» regnes ut fra valgene og oppdateres automatisk.
- Knapp «Åpne API-nøkler i Immich» → `<server>/user-settings?isOpen=api-keys`.
- 403 fra Immich vises som «API-nøkkelen mangler tilgangen …».
- Kart: alltid asset.read + asset.view; face.read (ansiktsbeskjæring, navn, Ken Burns mot ansikter); person.read / album.read / tag.read (lister); memory.read (På denne dagen); asset.update (favorittmerking).

## Tekst (egen innstillingsside)
- Hovedbryter + egne brytere for dato, sted, personnavn, beskrivelse, «For N år siden».
- Plassering: topp/bunn × venstre/midt/høyre.
- Tekstskygge av/på. Bakgrunnsboks av/på med hjørneradius og gjennomsiktighet.

## Stil og overganger
- Skygge rundt hele bildet fjernes.
- Overganger som brytere: toning, skyv venstre/høyre/opp/ned, zoom, vend. Rekkefølge tilfeldig eller etter tur. Varighet.
- Ken Burns: sakte zoom mot ansiktene mens bildet vises.
- Avrundede hjørner gjøres med en shader på hele rammen (så skyv/zoom også blir avrundet); faller tilbake til avrunding per bilde hvis shaderen ikke virker.

## Mine valg (ikke diskutert)
- Gamle `source`/`source-name` fjernes; eksisterende oppsett «alle bilder» påvirkes ikke.
- Tilgangsfeltet er et vanlig tekstfelt (Cinnamon har ikke dynamiske etiketter); widgeten skriver over det.
