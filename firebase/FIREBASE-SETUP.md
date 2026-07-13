# Firebase-migratie — setup (branch `firebase-migratie`)

De app draait nu (op `main`) op **Supabase**. Op deze branch bouwen we de **Firebase**-variant, zodat
de live-app blijft werken tot Firebase getest en goed is.

## Status
- ✅ `src/lib/firebase.ts` — de complete sync/auth-laag (Firestore + Firebase Auth), met **automatische
  chunking** zodat foto's/PDF's de 1 MB-per-document-limiet van Firestore niet raken. Zelfde interface als
  de Supabase-laag, dus de rest van de app kan er 1-op-1 op over.
- ✅ `firebase/firestore.rules` — beveiligingsregels (alleen ingelogde accounts mogen bij de data).
- ⏳ **Nog te doen (zodra jij het Firebase-project hebt aangemaakt):**
  1. De config invullen in `src/lib/firebase.ts` (6 waarden — zie hieronder).
  2. AppContext + Instellingen omzetten van `lib/supabase` naar `lib/firebase` (incl. realtime/auth-listener).
  3. De 3 Supabase-specifieke server-features herbouwen voor Firebase (Cloud Functions):
     admin-wachtwoordreset, verlof-goedkeuring, wachtwoord wijzigen.
  4. Samen testen op de branch → daarna live.

## Wat JIJ doet: Firebase-project aanmaken (± 5 min)
1. Ga naar **console.firebase.google.com** → **Add project** → naam bijv. "Wire Solutions" → aanmaken
   (Google Analytics mag je uitzetten).
2. **Build → Firestore Database → Create database** → kies **production mode** → locatie **europe-west**.
3. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable**.
4. **Firestore → Rules** → plak de inhoud van `firebase/firestore.rules` → **Publish**.
5. **Project settings (tandwiel) → General → Your apps → Web (</>)** → registreer een web-app →
   kopieer het **firebaseConfig**-blok (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId).

## Wat je mij stuurt
Plak dat `firebaseConfig`-blok hier in de chat. Dan zet ik het in `src/lib/firebase.ts`, koppel ik de app
om, herbouw ik de server-features en testen we het samen op de branch. Pas als het werkt, gaat het naar `main`.

> De Firebase web-config is **niet geheim** (net als de Supabase anon-key) — de beveiliging zit in de
> Firestore-regels hierboven.
