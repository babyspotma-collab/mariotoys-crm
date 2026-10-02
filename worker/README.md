# Programme local du CRM Mario Toys

Un seul programme Python, sur un de tes PC, qui traite **deux files** du CRM, un job à la fois, avec la **même session Gemini** (le Chrome de `chrome-profile/`) :

| File | Dossier | Ce qu'il fait |
|---|---|---|
| Création produits | `product_jobs/` | Ton code existant, logique inchangée : Claude lit la photo, Gemini fait le visuel, Shopify crée le brouillon. **Désactivée par défaut.** |
| Créatives | `creatives/` | 5 publicités marketing par photo, générées une à une par Gemini web. |

Il ne tourne jamais sur Vercel (Chrome/Playwright n'y sont pas adaptés) : il interroge le CRM toutes les 10 s.

## Installation (une fois)

```powershell
cd worker
python -m venv venv
venv\Scripts\python.exe -m pip install -r requirements.txt
copy .env.example .env        # puis remplir .env
```

Python 3.12 et Google Chrome (`C:\Program Files\Google\Chrome`) sont nécessaires. **Aucun** `playwright install` : le programme pilote le vrai Chrome.

`.env` (jamais commité) : `CRM_BASE_URL`, `WORKER_SECRET` (même valeur que dans Vercel), et pour la file produit `SHOPIFY_*`. Les routes `/api/worker/*` n'existent en production qu'une fois la branche `feature/creatives` déployée ; d'ici là, `CRM_BASE_URL=http://localhost:3000` avec un CRM lancé en local.

## Première connexion à Gemini (une fois)

1. Ferme tout Chrome lancé avec ce profil, puis `powershell -ExecutionPolicy Bypass -File start_chrome.ps1` : une fenêtre Chrome s'ouvre sur Gemini.
2. Connecte-toi **au compte Google secondaire**, accepte les écrans d'accueil de Gemini, ferme la fenêtre. La session reste dans `chrome-profile/` (aucun mot de passe n'est stocké par le programme).
3. Vérifie : `venv\Scripts\python.exe check_login.py` → « OK : Gemini est utilisable ».

Ne te sers pas de ce compte Google pour autre chose pendant les générations.

## Lancer

- À la main : double-clic sur `start-worker.bat` (fenêtre visible, `Ctrl+C` pour arrêter).
- Au démarrage de Windows : `install-autostart.ps1` (PowerShell **administrateur**) crée la tâche planifiée `MarioToysWorker` (ouverture de session + relance toutes les 5 min, sans fenêtre). `-Remove` la supprime. **Elle n'est pas installée tant que tu ne lances pas ce script.**
- Un seul programme à la fois par PC (verrou sur le port 47219). **Ne fais pas tourner l'ancien `mariotoys-images-automation` en même temps** (désactive sa tâche `MarioToysImagesWorker`).

Logs : `logs/worker.log` (2 Mo × 5, tournant), `logs/crash.log`.

## Fonctionnement

Chaque tour : Création produits d'abord (si activée), sinon Créatives. Pour chaque image : nouvelle conversation Gemini, **2 nouvelles tentatives** en cas d'échec, puis `ECHEC` avec la raison exacte dans le CRM. Les images trop lourdes (> 4,4 Mo, limite Vercel) sont ré-encodées en JPEG haute qualité.

**Blocages Gemini** : session expirée, limite atteinte, captcha. Le programme remet l'image en attente (sans échec), signale le problème au CRM (bandeau rouge sur la page Créatives), ne prend plus aucun job, re-teste toutes les 60 s et **reprend seul**. Il ne contourne jamais un captcha : à toi de le résoudre dans le Chrome du programme.

## Changer de fournisseur d'images

Les Créatives ne connaissent que l'interface `providers/base.py` (`ImageProvider`). Pour passer à l'API Gemini : ajouter `providers/gemini_api.py`, le déclarer dans `providers/__init__.py`, mettre `PROVIDER=gemini-api` dans `.env`. Rien d'autre à modifier. `PROVIDER=mock` génère des images de couleur unie (tests).

## Tests

```powershell
venv\Scripts\python.exe -m unittest discover -s tests -v
```

Sans réseau ni Gemini : CRM simulé + fournisseur mock (réessais, échecs, blocages, ré-encodage, états du heartbeat).

## Dépannage

- **`unable to get local issuer certificate`** : un antivirus (Avast « Web/Mail Shield ») inspecte le HTTPS. Le programme utilise le magasin de certificats de Windows (`truststore`) ; si l'erreur persiste, mettre à jour avec `pip install -U truststore`.
- **L'horloge de Windows doit être à l'heure** (service « Heure Windows » démarré, réglage automatique) : Vercel Blob refuse des jetons dont l'horodatage est en retard.
- **Chrome ne démarre pas** : vérifier `CHROME_EXE` dans `.env`.
- **`Mixed Content`/page blanche dans Chrome** : fermer le Chrome du programme ; il sera relancé tout seul.

## À valider avec le compte connecté (non testable sans lui)

- Le **téléchargement taille réelle** (`CREATIVES_FULLSIZE_DOWNLOAD`) : le bouton est cherché par son libellé (« Télécharger … taille réelle »). Le journal indique, pour chaque image, `export canvas LxH | téléchargement taille réelle LxH` ou son indisponibilité (repli sur l'export canvas, toujours valide). Si le libellé de Gemini diffère, l'adapter dans `providers/gemini_web.py` (`_FULLSIZE_BUTTON`).
- Le **format 4:5** et le **rendu du texte français** dépendent de Gemini : « Régénérer » dans le CRM corrige une image ratée.
