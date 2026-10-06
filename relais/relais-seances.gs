/**
 * ============================================================================
 * LE RELAIS DES SÉANCES — à déployer dans Google Apps Script
 * ============================================================================
 * Ce petit script sert une séance publiée à l'élève qui ouvre son lien, et
 * rien d'autre.
 *
 * POURQUOI IL EXISTE. Pour qu'un navigateur sans compte lise un fichier du
 * Drive, Google exige une clé d'API — qui arrive donc chez l'élève, et donc
 * chez n'importe qui. Ici, c'est le script qui lit le fichier, sous VOTRE
 * compte : plus aucune clé ne circule, et les séances n'ont même plus besoin
 * d'être partagées. Elles restent privées dans votre Drive.
 *
 * CE QU'IL ACCEPTE DE SERVIR. Uniquement les fichiers « .prof » rangés dans le
 * dossier « Au Tableau — séances publiées » de ce compte. Un identifiant pris
 * au hasard, un fichier d'un autre dossier, un document de travail : refusés.
 * Le script ne liste jamais le contenu du dossier — qui n'a pas le lien d'une
 * séance ne peut pas la découvrir.
 *
 * DEUX COMPTES, DEUX DÉPLOIEMENTS. Un script s'exécute sous un seul compte.
 * Déployez-le une fois dans chaque compte Google qui héberge des séances : le
 * compte de l'établissement pour les cours du lycée, le compte personnel pour
 * le reste. Chaque déploiement donne une adresse ; Au Tableau les range sous
 * un nom court (« lfb », « mem »…) et le lien de la séance dit lequel ouvrir.
 *
 * ---------------------------------------------------------------------------
 * DÉPLOIEMENT, une fois par compte (cinq minutes)
 * ---------------------------------------------------------------------------
 *  1. Ouvrir script.google.com en étant connecté AU BON COMPTE, puis
 *     « Nouveau projet ». Le renommer, par exemple « Relais Au Tableau ».
 *  2. Remplacer tout le contenu de « Code.gs » par ce fichier, et enregistrer.
 *  3. « Déployer » → « Nouveau déploiement » → type « Application Web ».
 *       • Description : Relais des séances
 *       • Exécuter en tant que : MOI
 *       • Qui a accès : TOUT LE MONDE
 *     Déployer, autoriser (Google prévient que le script accède à votre Drive :
 *     c'est précisément ce qu'on lui demande), puis copier l'adresse
 *     « …/exec ».
 *     L'adresse d'un compte d'établissement est plus longue — elle contient
 *     « /a/macros/votre-domaine/s/… » : c'est la bonne, prenez-la telle quelle.
 *     Ne prenez jamais celle qui finit par « /dev » : elle n'ouvre que pour vous.
 *  4. Dans Au Tableau : fenêtre « Publier pour le cahier de textes », rubrique
 *     « Comptes et relais », coller l'adresse en face du compte concerné.
 *  5. Vérifier d'un clic sur « Essayer ce relais » : le script répond son nom
 *     de compte et le dossier qu'il dessert.
 *  6. Cliquer « Copier la ligne du site » et reporter cette ligne dans
 *     lib/cloud/config.js, rubrique « relais ». C'est de là, et de là seule,
 *     que le navigateur de l'élève apprend l'adresse du relais : sans ce pas,
 *     les liens ne s'ouvrent que chez vous.
 *
 * À SAVOIR. Si votre établissement interdit les applications web ouvertes à
 * tous, l'étape 3 ne proposera que « les utilisateurs de votre organisation » :
 * les élèves du domaine pourront lire, les familles non. Au Tableau le dira à
 * la première vérification plutôt que de vous laisser distribuer un lien mort.
 *
 * MISES À JOUR. Après toute modification de ce fichier, « Déployer » → « Gérer
 * les déploiements » → crayon → « Version : nouvelle » : l'adresse ne change
 * pas, les liens déjà collés dans Pronote continuent de fonctionner.
 * ============================================================================
 */

/** Le dossier qu'Au Tableau crée pour les séances publiées. */
var DOSSIER = 'Au Tableau — séances publiées';

/** Ce que le fichier doit porter pour être servi. */
var EXTENSION = '.prof';

/** Combien de temps on se souvient du dossier, pour ne pas le rechercher. */
var MEMOIRE_DOSSIER = 6 * 60 * 60; // six heures, en secondes

/**
 * L'élève ouvre son lien : le lecteur d'Au Tableau demande la séance ici.
 * Deux formes de réponse, selon ce que le navigateur sait recevoir :
 * du JSON ordinaire, ou du JSONP quand « callback » est donné.
 */
function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    if (p.ping) return repondre(etatDuRelais(), p);
    var id = String(p.id || '');
    if (!/^[A-Za-z0-9_-]{10,}$/.test(id)) {
      return repondre({ erreur: 'Ce lien est incomplet : demandez-en un nouveau à votre enseignant.' }, p);
    }
    var fichier = fichierServable(id);
    if (!fichier) {
      return repondre({ erreur: 'Séance introuvable ou retirée. Demandez le lien à votre enseignant.' }, p);
    }
    return servir(fichier, p);
  } catch (err) {
    // Le détail reste dans le journal du script ; l'élève, lui, reçoit une
    // phrase qu'il peut répéter à son professeur.
    console.error(err);
    // Sauf quand c'est le professeur qui vérifie son installation : là, taire
    // la cause ne protège personne et fait perdre une heure. « Essayer ce
    // relais » reçoit donc la panne telle qu'elle est — presque toujours une
    // autorisation manquante, ou un déploiement réglé sur « l'utilisateur qui
    // accède » au lieu de « moi », auquel cas le script tourne sans compte et
    // ne voit aucun Drive.
    if (p.ping) {
      return repondre({ relais: 'Au Tableau', pret: false,
        erreur: 'Le relais répond, mais il a buté : ' + messageDe(err)
          + ' — vérifiez, dans « Gérer les déploiements », que « Exécuter en tant que » est bien VOUS,'
          + ' et lancez une fois « verifierLInstallation » depuis l’éditeur pour accorder l’accès au Drive.' }, p);
    }
    return repondre({ erreur: 'La séance n’a pas pu être lue. Réessayez dans un instant.' }, p);
  }
}

/** Ce qu'une erreur Apps Script a de lisible. */
function messageDe(err) {
  if (!err) return 'erreur inconnue';
  var m = err.message || String(err);
  return String(m).slice(0, 300);
}

/**
 * Le fichier demandé, s'il est bien une séance publiée de CE compte.
 * Trois conditions, et il faut les trois : exister, porter l'extension, et
 * se trouver dans le dossier des séances publiées.
 */
function fichierServable(id) {
  var fichier;
  try { fichier = DriveApp.getFileById(id); } catch (err) { return null; }
  if (!fichier || fichier.isTrashed()) return null;
  if (fichier.getName().slice(-EXTENSION.length) !== EXTENSION) return null;

  var vise = idDuDossier();
  if (!vise) return null;
  var parents = fichier.getParents();
  while (parents.hasNext()) {
    if (parents.next().getId() === vise) return fichier;
  }
  return null;
}

/** L'identifiant du dossier des séances, retenu d'un appel à l'autre. */
function idDuDossier() {
  var cache = CacheService.getScriptCache();
  var garde = cache.get('dossier');
  if (garde) return garde;

  var trouves = DriveApp.getFoldersByName(DOSSIER);
  var id = null;
  while (trouves.hasNext()) {
    var d = trouves.next();
    if (!d.isTrashed()) { id = d.getId(); break; }
  }
  if (id) cache.put('dossier', id, MEMOIRE_DOSSIER);
  return id;
}

/** La séance elle-même, telle qu'Au Tableau l'a écrite. */
function servir(fichier, p) {
  var texte = fichier.getBlob().getDataAsString('UTF-8');
  if (p.callback) {
    return ContentService
      .createTextOutput(String(p.callback) + '(' + texte + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(texte).setMimeType(ContentService.MimeType.JSON);
}

/**
 * De quoi vérifier l'installation sans publier quoi que ce soit : le compte
 * qui sert, et si le dossier des séances existe déjà.
 */
function etatDuRelais() {
  var id = idDuDossier();
  return {
    relais: 'Au Tableau',
    version: 1,
    compte: Session.getEffectiveUser().getEmail(),
    dossier: id ? DOSSIER : null,
    pret: !!id
  };
}

/** Une réponse que le lecteur sait lire, JSON ou JSONP. */
function repondre(objet, p) {
  var texte = JSON.stringify(objet);
  if (p && p.callback) {
    return ContentService
      .createTextOutput(String(p.callback) + '(' + texte + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(texte).setMimeType(ContentService.MimeType.JSON);
}

/**
 * À lancer une fois depuis l'éditeur (bouton « Exécuter ») si l'on veut
 * autoriser le script avant le déploiement, et voir dans le journal ce qu'il
 * dessert. Ne sert à rien d'autre.
 */
function verifierLInstallation() {
  console.log(JSON.stringify(etatDuRelais(), null, 2));
}
