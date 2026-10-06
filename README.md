# Au Tableau !

> **Cette copie** ([mathsetmoi/Autableau](https://github.com/mathsetmoi/Autableau))
> est un fork d'[Au Tableau](https://github.com/remy-live/Autableau) de Rémy
> Devoddere. Elle y ajoute **Mes tableaux dans mon Drive** — un dossier par
> classe, un tableau par séance, rangés dans un dossier synchronisé par Google
> Drive pour ordinateur — ajoute la **calculatrice NumWorks** (collège ou lycée) et les **automatismes** (banque de questions, séries, journal par classe) parmi les outils, permet de **publier une séance pour le cahier de textes** — un lien que les élèves et les parents ouvrent pour rejouer la construction du tableau —, rend le déplacement de la vue fluide (la photo du dernier rendu glisse pendant le geste, on repeint quand la main s'arrête), et corrige quatre choses : l'écriture qui disparaissait par endroits quand on déplaçait la vue (le tri spatial perdait des traits), le tableau qui se repeignait plusieurs fois par image, l'encre écrite à côté d'un
> morceau de document qui disparaissait, et un tableau neuf qui n'enregistrait
> rien. Le reste est le travail de l'auteur, sous la même licence.

Un tableau interactif pour la classe. Il s'ouvre dans un navigateur, il n'a
besoin de rien d'autre, et il fonctionne sans connexion.

Pas d'installation, pas de compte, pas de droits administrateur : on copie le
dossier, on ouvre `index.html`, on écrit. C'est ce qui permet de s'en servir sur
le poste d'une salle de classe, sur une clé USB, ou sur un vidéoprojecteur
interactif dont personne n'a le mot de passe.

## Démarrer

1. Récupérer le dossier (bouton **Code → Download ZIP**, puis décompresser).
2. Ouvrir `index.html` dans **Chrome, Edge ou un navigateur Chromium**.
3. C'est tout.

> **Pourquoi Chromium ?** Firefox et Safari font tourner le reste, mais ils ne
> savent pas encore écrire dans un dossier choisi : la sauvegarde automatique
> décrite ci-dessous n'y fonctionne pas, et il faut exporter à la main. Sur un
> poste de classe, prendre Chrome ou Edge évite cette corvée.

Pour s'en servir à plusieurs postes, on peut aussi le déposer sur un
hébergement statique (GitHub Pages, l'espace web de l'établissement). Les
sources en ligne — Dropbox, Google Drive, Nextcloud — n'existent que dans ce
cas : elles exigent une adresse en `http(s)` et ne s'affichent pas quand la
page est ouverte depuis un dossier.

## Mettre la sauvegarde en place — à faire en premier

Tout le travail vit dans le stockage du navigateur. Un « effacer les données de
navigation », un profil scolaire réinitialisé, un changement de poste, et il
n'en reste rien.

**Menu Exporter → Sauvegarde automatique.** On désigne un dossier une fois — le
disque, une clé USB, un dossier synchronisé — et une copie complète de l'espace
s'y écrit toute seule : un fichier par jour, les dix derniers conservés. À la
réouverture, le navigateur redemande le droit d'écrire ; un bandeau propose de
le rendre en un clic.

Sans cela, l'application rappelle au bout de sept jours qu'aucune copie n'a été
faite.

## Mes tableaux dans mon Drive

« Mes tableaux » vit dans le navigateur du poste. Pour retrouver ses séances
d'un ordinateur à l'autre, classe par classe, le tiroir de droite a une seconde
source : **Mon Drive**.

1. Installer **Google Drive pour ordinateur** (ou OneDrive, ou une clé USB : tout
   dossier du disque convient). Le Drive apparaît alors comme un lecteur, par
   exemple `G:\Mon Drive`.
2. Dans le tiroir de droite, onglet **Tableaux**, choisir **Mon Drive**, puis
   **+ Ajouter un dossier** — par exemple `G:\Mon Drive\Au Tableau`.
3. Créer un dossier par classe (bouton **Nouveau dossier**), puis un tableau par
   séance (**Nouveau tableau**) : le fichier est créé dans la classe et tout ce
   qu'on y écrit s'y enregistre tout seul, au plus toutes les dix secondes.

**Plusieurs emplacements, et l'on passe de l'un à l'autre d'un clic.** Mon
Drive, un Drive partagé, une clé USB, un dossier du disque : le **+** les
ajoute à la liste, en tête du tiroir. La ligne en évidence est le dossier
ouvert ; un clic sur une autre montre son arbre à elle, un double-clic la
renomme (le dossier, lui, garde son nom), la croix la retire de la liste sans
toucher au dossier ni aux tableaux. Le tableau ouvert reste ouvert quand on
regarde ailleurs, et continue de s'enregistrer dans son fichier à lui.

Un tableau ouvert depuis le Drive s'y réenregistre : le bandeau « Vous
travaillez sur » le dit, avec l'heure de la dernière écriture. On ouvre une
séance d'un double-clic, on la renomme, on la glisse dans une autre classe, on
la supprime (Drive garde une corbeille trente jours). Le bouton **Enregistrer
dans votre Drive…** range dans le Drive un tableau qui n'y est pas encore.

Chaque séance est un fichier `.prof`, le format d'export d'un seul tableau :
l'import ordinaire (**Ouvrir un seul tableau**) sait donc les lire, et une
séance modifiée sur un autre poste est signalée à la réouverture.

Comme la sauvegarde automatique, cela demande Chrome ou Edge, et le navigateur
redemande à chaque ouverture le droit d'écrire dans un dossier — une fois par
emplacement, sur un geste : le clic sur son nom suffit, ou celui du bandeau qui
le propose. Le code est dans
`lib/dossier/mon-dossier.js`, et n'a rien changé à `script.js` : les mises à
jour de l'auteur se reprennent avec `git merge upstream/main`.

## Écrire au stylet

Avec une tablette graphique (Wacom, par exemple), trois choses sont réglées
dans `lib/tableau/stylet.js` :

- **tous les échantillons de la tablette sont posés**, y compris ceux que le
  navigateur groupe entre deux images — une boucle rapide reste une boucle ;
- **le survol que la tablette envoie sous un autre nom** pendant qu'on écrit
  ne coupe plus le trait ;
- **la pression a un plancher** (20 %) et ses sauts sont adoucis : un contact
  léger ne fait plus un cheveu, le trait s'affine aux extrémités sans
  disparaître.
- **la gomme du stylet efface** (`lib/tableau/gomme-du-stylet.js`) : on
  retourne le stylet, on frotte, l'encre touchée s'en va — traits, segments,
  figures —, et l'outil d'avant revient au relâcher. Une photo, un texte ou
  un objet verrouillé sous le frottement restent en place. Un frottement fait
  un seul pas d'annulation.

Côté Windows, dans les réglages de la tablette, laisser **Windows Ink** activé :
sans lui, le navigateur ne reçoit pas la pression et voit le stylet comme une
souris.

## Les automatismes

Les automatismes sont les questions de début d'heure : cinq à dix questions
courtes, projetées une à une, que la classe traite sur l'ardoise avant la
correction. Rubrique **Exercices**, bouton **Automatismes** : une fenêtre à
trois volets.

- **La banque** : vos questions, avec leur réponse, un thème et un niveau. Les
  formules s'écrivent entre dollars, comme dans l'outil Texte : `Développer
  $(x+1)^2`. Chaque question dit combien de fois elle a été posée, à qui et
  quand ; le filtre **Posée à…** distingue, pour une classe, ce qu'elle a déjà
  eu et ce qu'elle n'a jamais eu.
- **Les séries** : cochez des questions, faites-en une série — l'automatisme
  d'une heure. On la réordonne, on règle la durée par question, on la
  **projette** (une question à la fois, Espace pour la réponse, T pour toutes
  d'un coup au moment de corriger), on la **pose au tableau** en un tampon
  pour corriger dessus, on la refait à une autre classe.
- **Le journal** : chaque projection s'y écrit toute seule, avec la classe du
  moment (la pastille en haut à droite du tableau). On le filtre par classe et
  par mot — le mot cherche aussi dans les thèmes. **Marquer comme donnée** y
  inscrit une série distribuée sur papier.

Tout vit sur cet ordinateur, comme les classes ; une copie part dans le
dossier du Drive quand il est ouvert (`automatismes.json`, à la racine), et un
autre poste la reprend à l'ouverture si elle est plus récente que la sienne.
**Exporter** et **Importer** échangent la banque en JSON avec un collègue ;
l'import ajoute, il n'écrase rien. Le code est dans
`lib/automatismes/automatismes.js`.

## Publier la séance dans le cahier de textes

**Un lien par séance.** Dans le menu **Exporter → Publier pour le cahier de
textes**, publier le tableau ouvert puis **Copier le lien** dans Pronote.
L’élève arrive directement sur cette séance et appuie sur ▶ pour la rejouer.
Il n’a besoin ni de compte Google, ni d’installation. Le lecteur permet aussi
les pas avant/arrière, le choix de la page et de la vitesse.

**Monter le replay avant de publier.** L’onglet **Monter le replay** ouvre une
copie de la séance dans un lecteur. Parcourir les étapes, marquer **Début ici**
et **Fin ici**, puis **Retirer ce passage**. On peut retirer plusieurs passages,
y compris une page entière, et rétablir chaque coupe. **Voir le montage** montre
exactement la suite d’étapes qui sera envoyée aux élèves. Terminer par
**Continuer vers la publication**, puis publier et copier le lien dans Pronote.

Les coupes sautent des états du tableau : après une coupe, les objets encore
présents à cet instant restent visibles. Pour masquer un trait erroné, couper
jusqu’à son effacement ou sa correction. Le tableau de travail reste intact.
Les coupes restent en mémoire jusqu’au rechargement du site ; la publication
enregistre durablement la copie montée. Un tableau différent ou modifié commence
un nouveau montage à la réouverture de la fenêtre.

La publication envoie une **copie** du tableau et de son film sur Drive.
Les tableaux de travail restent dans leurs dossiers de classe et de chapitre.
Au Tableau crée à la racine du compte connecté un dossier privé
`Au Tableau — séances publiées`. **Seul le fichier de la séance est partagé**
en lecture « Tout utilisateur disposant du lien ». Le dossier n’est jamais
partagé par l’application. Le lien contient l’identifiant du fichier, sans
identifiant de dossier ; le lecteur télécharge ce fichier directement et ne
liste aucune autre séance.

**Le lien d’une séance ne change pas.** Reprendre un tableau et le republier
remplace le contenu de la séance déjà en ligne : l’adresse collée dans
Pronote montre la nouvelle version, il n’y a rien à recoller. L’application
retient, pour chaque tableau, la séance qu’il a publiée ; sur un autre poste
elle la reconnaît à son nom et demande s’il faut la mettre à jour. Répondre
non publie une séance de plus, avec son propre lien.

### Installation

1. Activer **Google Drive API** dans Google Cloud, puis créer une **clé API**.
   La restreindre à cette API et à l’origine du lecteur, par exemple
   `https://mathsetmoi.github.io/*`. La clé identifie le projet Google : elle
   n’accorde aucun accès aux fichiers privés. Elle peut appartenir à un
   autre compte que celui qui héberge les séances.
2. Dans **Compte Google et clé**, coller la clé et enregistrer. Les réglages
   restent dans ce navigateur. **La clé ne figure pas dans les liens** : pour
   que les élèves puissent lire une séance, elle doit être écrite dans
   `lib/cloud/config.js`, qui vaut pour tout le site. L’y mettre permet aussi
   d’en changer sans casser les liens déjà distribués.
3. Cliquer **Connecter mon compte Google** et autoriser la publication.
   Seul l’enseignant effectue cette connexion. L’application demande le droit
   `drive.file` pour les fichiers qu’elle crée, sans accès général au Drive.
   Le jeton de publication reste en mémoire et n’est jamais transmis aux
   élèves ni enregistré avec les réglages. Reconnecter après un rechargement
   ou l’expiration de l’autorisation.
4. Donner un titre, une classe et une date, puis **Publier la séance**.
   Le lien est proposé après vérification de la lecture anonyme. Il n’y a
   plus de dossier local à sélectionner, ni de synchronisation Drive Desktop
   à attendre. Le bouton **Copier le texte pour Pronote** ajoute un résumé.

L’identifiant client OAuth du site est prérempli. Pour héberger sa propre
copie, créer un client **Application Web**, déclarer l’origine du site parmi
les **origines JavaScript autorisées** et configurer l’écran de consentement
Google avec `https://www.googleapis.com/auth/drive.file`. Si l’application
OAuth est en test, ajouter le compte enseignant aux utilisateurs de test.
Saisir l’identifiant client dans les options de connexion (ou dans
`lib/cloud/config.js`). **Aucun secret client** ne doit être saisi dans le
site. Un compte d’établissement peut interdire le partage externe : dans ce
cas, la publication affiche l’échec et ne propose pas de lien valide.

**Les anciens partages ne sont pas modifiés automatiquement.** Si vous
aviez partagé un dossier entier avec l’ancienne version, remettre son
**Accès général → Limité** dans Google Drive. Ses anciens liens par nom de
fichier cesseront alors de fonctionner : republier les séances souhaitées et
remplacer ces liens dans Pronote. Les anciens liens restent lisibles tant
que leur ancien dossier est public, pour permettre cette transition.

L’onglet **Déjà publiées** permet de retrouver les liens et de **Retirer**
l’accès à une séance, sans modifier le tableau de travail. Un lien transmis
reste utilisable par toute personne qui le possède jusqu’à son retrait ; le
retrait n’efface pas les copies déjà téléchargées. Garder le dossier de
publication en accès **Limité**. Si son partage a été changé manuellement,
Au Tableau utilise un nouveau dossier privé pour les prochaines publications.

Le lecteur est en lecture seule et ne sauvegarde rien dans les tableaux du
visiteur. Le film porte toute la séance, grâce à
`lib/tableau/film-complet.js`. Un tableau ancien sans film s’ouvre sur son
état final avec une explication. Code : `lib/lecteur/`.


## La calculatrice NumWorks, collège ou lycée

Rubrique **Maths - Algèbre**, bouton **Calculatrice NumWorks** : on choisit
le modèle — la scientifique du collège ou la graphique du lycée — et la
calculatrice se pose sur le tableau, en français, dans une fenêtre qui se
déplace, se redimensionne, se met en grand et part avec la séance. On la
manipule à la souris, au doigt ou au clavier (cliquer dessus d'abord).

C'est l'émulateur de NumWorks lui-même, servi par leur site : il faut le
réseau la première fois, ensuite le navigateur le garde en cache. La page
`lib/numworks/calculatrice.html` pose leur composant avec les bons réglages ;
quand NumWorks met à jour son émulateur, les adresses qu'elle contient sont à
relire dans le code source de leurs pages (c'est écrit en tête du fichier).

## Ce qu'il y a dedans

- **Écrire et tracer** : crayon, surligneur, laser, textes, formes, points,
  segments, cercles, arcs, courbes, polygones — avec aimantation sur le
  quadrillage, les outils et les intersections.
- **Les instruments** : règle, équerre, rapporteur, compas, qui se posent sur le
  tableau, se tournent et servent à tracer pour de bon.
- **Les fonds** : page blanche, petits carreaux, Seyès, copie d'examen, papier
  millimétré, points, isométrique, avec repère et quadrillage réglables.
- **Les documents** : ouvrir un PDF, le feuilleter, chercher dans son texte,
  écrire dessus, repérer automatiquement les zones à remplir d'un polycopié.
  Le fichier part avec le tableau : on le rouvre entier, pas en photo.
- **Le lecteur** : rejouer la construction du tableau devant la classe, à la
  vitesse qu'on veut, en boucle, avec un fondu entre les étapes.
- **Les classes** : élèves, groupes, points, badges, tirage au sort.
- **Quatre-vingt-six outils** rangés par matière — mathématiques surtout, mais
  aussi physique-chimie, français, histoire-géographie, musique, informatique,
  plus des jeux et des outils de gestion de classe.

## Travailler sur le code

Aucune dépendance, aucune étape de compilation : on modifie un fichier, on
recharge la page.

| Fichier | Rôle |
|---|---|
| `index.html` | La page et toute l'interface |
| `script.js` | Le tableau : dessin, objets, pages, documents, sauvegarde |
| `plugin.js` | Les quatre-vingt-six outils |
| `style.css` | L'apparence |
| `lib/` | Les bibliothèques fournies (voir `NOTICE.md`) |
| `lib/dossier/` | Mes tableaux dans mon Drive (ce fork) |
| `lib/numworks/` | La calculatrice NumWorks, collège ou lycée (ce fork) |
| `lib/automatismes/` | Les automatismes : banque de questions, séries, journal de ce qui a été donné (ce fork) |
| `lib/lecteur/` | Rejouer une séance publiée, et la publier pour Pronote (ce fork) |
| `lib/tableau/` | Le film entier de la séance, le déplacement de la vue (un dessin par image, la photo qui glisse) et le stylet (échantillons groupés, faux survol filtré, pression adoucie, gomme du stylet) — ce fork |
| `tests/` | La suite de non-régression |

Après toute modification d'un de ces fichiers, penser à incrémenter le `?v=` de
la balise correspondante dans `index.html` : sans cela le navigateur ressert son
ancienne copie.

### Les tests

Ils pilotent un vrai navigateur, dessinent, cliquent, exportent, et vérifient
que ce qui marchait marche encore. Ils tournent aussi à chaque poussée sur
`main`.

```bash
npm install --no-save playwright
npx playwright install --with-deps chromium
node tests/run.cjs            # toute la suite
node tests/run.cjs documents  # seulement les fichiers dont le nom contient « documents »
```

La règle de la maison : **une correction n'est finie que lorsqu'on a réintroduit
le bug et vu le test tomber.** Un test qui passe dans les deux cas ne prouve
rien. Le détail est dans `tests/README.md`.

## Licence

**PolyForm Noncommercial 1.0.0** — voir `LICENSE`.

Chacun peut s'en servir, le modifier et le partager, à condition que ce ne soit
pas à des fins commerciales. L'usage par un établissement scolaire, une
association, une administration ou un particulier est expressément permis.

Ce n'est donc pas une licence « open source » au sens formel du terme, puisque
celles-ci autorisent toutes l'usage commercial. C'est un choix assumé : le
travail reste libre pour les collègues, et personne ne peut le revendre.

Les bibliothèques fournies gardent leurs propres licences, qui autorisent leur
redistribution mais imposent de conserver leurs mentions : elles sont réunies
dans `NOTICE.md`. Les données cartographiques issues de `world-countries`
restent en particulier sous licence ODbL.

---

© 2026 Rémy Devoddere
