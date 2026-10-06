# Règles fixes — Automatisation fiches produit Mario Toys

S'applique à chaque création de produit Shopify (workflow 1, "Ajout produit").
Référencé depuis `CLAUDE.md`.

## Format de la fiche produit

- Titre du produit en gras
- Trois sections en gras, dans cet ordre : **À propos de cet article**,
  **Caractéristiques principales**, **Âge recommandé**
- Texte brut sans markdown/HTML de ma part (compatibilité Shopify directe —
  c'est le script de création qui assemble le HTML minimal)
- Ton commercial, attractif pour les parents ; rédigé comme si le produit
  était bien connu (jamais "l'emballage indique...")
- Ne jamais mentionner la référence produit (SKU, ID interne) dans la description
- Ne jamais laisser "Âge recommandé" vide ou "non précisé" — déduire un âge
  raisonnable depuis la photo/le titre/la description
- Répliques non officielles : mentionner "Réplique non officielle" et "non
  affiliée à la marque" dans le titre ET dans les points clés

## Process d'automatisation

**Méthode 1 (photos)** — celle utilisée par `mariotoys-images-automation` :
1. Dossier `nouveaux_produits/` : une photo par produit, prix dans le nom du
   fichier (ex : `299.jpg` ou `voiture-police_299.jpg`). Pas de fichier texte
   séparé — tout le reste (titre, description, âge, catégorie, marque, tags)
   est déduit de la photo + recherche en ligne.
2. Si aucun prix dans le nom du fichier : mettre le produit de côté, le
   signaler à l'utilisateur, ne pas traiter.

   **Variante file d'attente CRM** (`mario-toys-crm`, page "Création
   produits") : les photos viennent d'exports WhatsApp avec des noms
   aléatoires — **jamais** utilisés pour le prix, le titre ou le SKU. Depuis
   le 29/09/2026, le coût d'achat (nombre suivi de "DH", en ignorant les
   mentions "xx pcs") et la référence sont lus sur la photo par **Claude**
   (`claude_analysis.py`, `claude -p` sur l'abonnement), qui identifie aussi
   le produit, fait la recherche en ligne et rédige la fiche. Gemini ne fait
   plus que le visuel. Si le prix ou la référence est illisible : champ vide
   et tag "À compléter", le produit est créé quand même.
3. Rechercher activement 3-4 vraies photos/caractéristiques en ligne par
   produit pour identifier précisément le produit et rédiger la fiche.
4. Images finales du produit Shopify : visuels générés par Gemini à partir
   de la photo fournie (fond blanc studio, fidèles au produit) **en
   priorité**. Compléter avec des photos trouvées en ligne seulement si
   elles sont de bonne qualité et correspondent exactement au produit.
5. Lister les collections existantes et détecter celle qui correspond.
   **Ne jamais deviner approximativement** : si rien ne correspond
   clairement, s'arrêter et demander confirmation avant de créer une
   nouvelle collection ou de forcer un rattachement.
6. Lister les tags existants pour rester cohérent avec la nomenclature déjà
   utilisée sur la boutique.
7. Écrire `product-input.json`, lancer le script de création Shopify.
8. Une fois le produit créé avec succès, déplacer la photo traitée de
   `nouveaux_produits/` vers `nouveaux_produits/traites/`.

**Méthode 2 (Excel fournisseur)** — pas encore implémentée, conservée pour
plus tard : fichier avec nom produit, prix d'achat, prix de vente (PVC TTC),
images intégrées → colonne "Ref Number" généralement vide, ne jamais
l'utiliser comme SKU. Les images intégrées au fichier servent de photos de
référence pour Gemini (même pipeline de génération que la méthode photos).

## Balises (tags)

- Balise d'âge **obligatoire**, selon les tags réels déjà utilisés sur la
  boutique (vérifiés via `--list-tags` — format inconsistant d'un tag à
  l'autre, on reprend tel quel plutôt que d'harmoniser) :
  - 0-12 mois → `0-12`
  - 12-36 mois → `12-36`
  - 3-5 ans → `3-5`
  - 6-8 ans → `6-8 ans`
  - 9-11 ans → `9-11 ans`
  - 12 ans et + → `12 ans et +`
- Toujours ajouter la balise "Nouveauté"
- Ajouter la marque comme balise si elle est visible sur la photo/l'emballage
- Réutiliser la nomenclature de tags déjà existante sur la boutique plutôt
  que d'inventer de nouvelles variantes d'un même tag — pas de nombre fixe
  de balises thématiques

## Prix, coût et remise

- Case "Facturer la taxe" toujours décochée (`taxable: false`)
- **Méthode photos** : le nombre dans le nom du fichier (ou visible sur la
  photo si le nom de fichier n'a pas pu être renommé avant dépôt) est le
  **coût d'achat**. Prix de vente = coût × 2,1, arrondi au multiple de 50
  DH supérieur, puis **-1 DH** (jamais un prix qui finit par 0). Exemple :
  coût 65 DH → 65 × 2,1 = 136,5 → arrondi 150 → **149 DH**. Le champ
  "Coût" Shopify reçoit le coût d'achat tel quel (65 DH dans l'exemple).
- **Méthode Excel** (plus tard) : utiliser le PVC TTC comme prix de vente,
  + 20 DH si le produit fait moins de 200 DH, + 30 DH si 200 DH ou plus.
  Champ "Coût" rempli depuis la colonne Prix d'achat/Prix de
  distribution/Prix Revendeurs TTC si disponible.
- Remise via le champ "Prix de comparaison" (`compareAtPrice`) : toujours
  un **nombre entier se terminant par 9** (ex : 179, 199 — jamais de
  décimales), choisi aléatoirement parmi les valeurs qui donnent une
  remise affichée entre 10 % et 30 % par rapport au prix de vente
  (`remise = (compareAtPrice - prix_vente) / compareAtPrice`). Exemple :
  prix de vente 149 DH → candidats valides 169/179/189/199/209 DH.
- Stock par défaut (méthode photos) : **10**.
- **SKU** : si une référence est visible sur la photo d'origine (étiquette,
  emballage fournisseur), l'utiliser comme SKU. Sinon laisser le SKU vide.
  Ne jamais la mentionner dans la description (déjà couvert plus haut).

## Publication

- Produit créé en statut **brouillon** (validation avant publication)
- Ajouter le produit aux canaux de vente (sinon invisible sur le site même
  une fois publié manuellement)
