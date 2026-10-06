// LE RELAIS DES SÉANCES, ÉPROUVÉ DES DEUX CÔTÉS — sans réseau ni navigateur.
//
// Côté Google, le script (relais/relais-seances.gs) est exécuté ici sur un
// faux Drive : il doit servir une séance publiée, et rien d'autre.
// Côté élève, lib/lecteur/relais.js parle à un faux relais : il doit lire la
// séance, et dire en français ce qui cloche quand ça cloche.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DOSSIER = 'Au Tableau — séances publiées';
const EXEC = 'https://script.google.com/macros/s/AKfy_essai/exec';
const seance = (titre) => ({ name: titre, seance: { titre }, data: { pages: [{ film: [] }] } });

// ---------------------------------------------------------------------------
// UN FAUX DRIVE POUR APPS SCRIPT
// ---------------------------------------------------------------------------
function script(options = {}) {
    const fichiers = new Map();
    const dossiers = [];
    const memoire = new Map();
    const ajouterDossier = (nom, id) => { const d = { nom, id, corbeille: false }; dossiers.push(d); return d; };
    const dossierDesSeances = options.sansDossier ? null : ajouterDossier(DOSSIER, 'dossier_1');

    const fauxFichier = (f) => ({
        getName: () => f.nom,
        isTrashed: () => !!f.corbeille,
        getParents: () => {
            let i = 0;
            return { hasNext: () => i < f.parents.length,
                     next: () => ({ getId: () => f.parents[i++] }) };
        },
        getBlob: () => ({ getDataAsString: () => f.texte })
    });

    const ctx = {
        console: { log() {}, error() {} },
        JSON, String, RegExp,
        DriveApp: {
            getFileById: (id) => {
                const f = fichiers.get(id);
                if (!f) throw new Error('No item with the given ID could be found');
                return fauxFichier(f);
            },
            getFoldersByName: (nom) => {
                if (options.panne) throw new Error("You do not have permission to call DriveApp.getFoldersByName");
                const trouves = dossiers.filter(d => d.nom === nom);
                let i = 0;
                return { hasNext: () => i < trouves.length,
                         next: () => { const d = trouves[i++]; return { getId: () => d.id, isTrashed: () => d.corbeille }; } };
            }
        },
        CacheService: { getScriptCache: () => ({
            get: (k) => memoire.get(k) || null,
            put: (k, v) => memoire.set(k, v)
        }) },
        Session: { getEffectiveUser: () => ({ getEmail: () => options.compte || 'prof@exemple.fr' }) },
        ContentService: {
            MimeType: { JSON: 'application/json', JAVASCRIPT: 'text/javascript' },
            createTextOutput: (t) => ({ texte: t, type: null, setMimeType(m) { this.type = m; return this; } })
        }
    };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'relais', 'relais-seances.gs'), 'utf8'), ctx,
        { filename: 'relais-seances.gs' });

    return {
        ctx, fichiers, dossiers, dossierDesSeances,
        poser: (id, nom, contenu, parents) => {
            fichiers.set(id, { nom, texte: JSON.stringify(contenu), corbeille: false,
                parents: parents || [dossierDesSeances ? dossierDesSeances.id : 'ailleurs'] });
            return id;
        },
        demander: (p) => ctx.doGet({ parameter: p })
    };
}

const lu = (sortie) => JSON.parse(sortie.texte);

test('le relais sert une séance publiée, et dit son compte quand on le sonde', () => {
    const e = script({ compte: 'prof@lfbali.com' });
    e.poser('SEANCE_1aaaaaaaaaaaaaaaaaaaa', 'cours.prof', seance('Les suites'));
    const r = lu(e.demander({ id: 'SEANCE_1aaaaaaaaaaaaaaaaaaaa' }));
    assert.equal(r.seance.titre, 'Les suites');
    const etat = lu(e.demander({ ping: '1' }));
    assert.deepEqual({ relais: etat.relais, compte: etat.compte, pret: etat.pret },
        { relais: 'Au Tableau', compte: 'prof@lfbali.com', pret: true });
});

test('il refuse tout ce qui n’est pas une séance publiée de ce compte', () => {
    const e = script();
    e.poser('AILLEURSaaaaaaaaaaaaaaaaaaaa', 'cours.prof', seance('Hors dossier'), ['un_autre_dossier']);
    e.poser('AUTRE_TYPEaaaaaaaaaaaaaaaaaa', 'notes.txt', seance('Mauvaise extension'));
    e.poser('CORBEILLEaaaaaaaaaaaaaaaaaaa', 'vieux.prof', seance('À la corbeille'));
    e.fichiers.get('CORBEILLEaaaaaaaaaaaaaaaaaaa').corbeille = true;

    for (const id of ['AILLEURSaaaaaaaaaaaaaaaaaaaa', 'AUTRE_TYPEaaaaaaaaaaaaaaaaaa', 'CORBEILLEaaaaaaaaaaaaaaaaaaa', 'INCONNUaaaaaaaaaaaaaaaaaaaaa']) {
        const r = lu(e.demander({ id }));
        assert.match(r.erreur, /introuvable|retirée/, 'refusé : ' + id);
    }
    // Un identifiant trop court n'est même pas cherché.
    assert.match(lu(e.demander({ id: 'x' })).erreur, /incomplet/);
    assert.match(lu(e.demander({})).erreur, /incomplet/);
});

test('aucune façon de lister ou de deviner les autres séances', () => {
    const e = script();
    e.poser('SEANCE_Aaaaaaaaaaaaaaaaaaaaa', 'a.prof', seance('A'));
    e.poser('SEANCE_Bbbbbbbbbbbbbbbbbbbbb', 'b.prof', seance('B'));
    // Le relais n'expose qu'une seule porte : un identifiant précis.
    const sondage = lu(e.demander({ ping: '1' }));
    assert.equal(sondage.dossier, DOSSIER);
    assert.equal(Object.prototype.hasOwnProperty.call(sondage, 'fichiers'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(sondage, 'seances'), false);
    assert.equal(lu(e.demander({ id: 'SEANCE_Aaaaaaaaaaaaaaaaaaaaa' })).seance.titre, 'A');
});

test('le dossier absent n’est pas une panne : on le dit, et rien ne fuit', () => {
    const e = script({ sansDossier: true });
    e.poser('SEANCE_1aaaaaaaaaaaaaaaaaaaa', 'cours.prof', seance('Les suites'), ['dossier_disparu']);
    assert.match(lu(e.demander({ id: 'SEANCE_1aaaaaaaaaaaaaaaaaaaa' })).erreur, /introuvable|retirée/);
    assert.equal(lu(e.demander({ ping: '1' })).pret, false);
});

test('la réponse JSONP enveloppe la séance dans la fonction demandée', () => {
    const e = script();
    e.poser('SEANCE_1aaaaaaaaaaaaaaaaaaaa', 'cours.prof', seance('Les suites'));
    const r = e.demander({ id: 'SEANCE_1aaaaaaaaaaaaaaaaaaaa', callback: 'retour42' });
    assert.ok(r.texte.startsWith('retour42('), r.texte.slice(0, 40));
    assert.equal(r.type, 'text/javascript');
});

// ---------------------------------------------------------------------------
// CÔTÉ ÉLÈVE : lib/lecteur/relais.js
// ---------------------------------------------------------------------------
function lecteur(reponse) {
    const stockage = new Map();
    const demandes = [];
    const ctx = {
        URL, URLSearchParams, JSON, console,
        location: new URL('https://mathsetmoi.github.io/mem_teachingtools/'),
        localStorage: { getItem: k => stockage.get(k) || null, setItem: (k, v) => stockage.set(k, v),
                        removeItem: k => stockage.delete(k) },
        AUTABLEAU_PUBLICATION: { relais: { lfb: EXEC } },
        fetch: async (url) => { demandes.push(url); return reponse(url); }
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'lib', 'lecteur', 'relais.js'), 'utf8'), ctx,
        { filename: 'relais.js' });
    return { ctx, demandes, stockage };
}
const repondre = (objet, init) => new Response(JSON.stringify(objet), { status: 200, ...init });

test('le lecteur lit la séance par le relais, sans clé ni cookie', async () => {
    const e = lecteur(() => repondre(seance('Les suites')));
    const { contenu } = await e.ctx.Relais.lireLaSeance('lfb', 'SEANCE_1aaaaaaaaaaaaaaaaaaaa');
    assert.equal(contenu.seance.titre, 'Les suites');
    assert.equal(e.demandes.length, 1);
    assert.ok(e.demandes[0].startsWith(EXEC + '?id=SEANCE_1'), e.demandes[0]);
    assert.equal(e.demandes[0].includes('key='), false, 'aucune clé ne part avec la demande');
});

test('un relais inconnu, une adresse douteuse : on refuse avant d’appeler', async () => {
    const e = lecteur(() => repondre({}));
    await assert.rejects(e.ctx.Relais.lireLaSeance('xxx', 'SEANCE_1aaaaaaaaaaaaaaaaaaaa'), /relais que ce site ne connaît pas/);
    e.ctx.Relais.poser('pirate', 'https://exemple-pirate.fr/vol?x=1');
    await assert.rejects(e.ctx.Relais.lireLaSeance('pirate', 'SEANCE_1aaaaaaaaaaaaaaaaaaaa'), /application Apps Script/);
    assert.equal(e.demandes.length, 0, 'aucune requête partie');
});

test('un déploiement fermé répond une page de connexion : on le dit en clair', async () => {
    const e = lecteur(() => new Response('<html><body>Connexion</body></html>', { status: 200 }));
    await assert.rejects(e.ctx.Relais.lireLaSeance('lfb', 'SEANCE_1aaaaaaaaaaaaaaaaaaaa'), /tout le monde/);
});

test('une erreur du relais remonte telle qu’il l’a écrite', async () => {
    const e = lecteur(() => repondre({ erreur: 'Séance introuvable ou retirée. Demandez le lien à votre enseignant.' }));
    await assert.rejects(e.ctx.Relais.lireLaSeance('lfb', 'SEANCE_1aaaaaaaaaaaaaaaaaaaa'), /introuvable ou retirée/);
});

test('« Essayer ce relais » reconnaît un relais d’Au Tableau, et rejette les autres', async () => {
    const bon = lecteur(() => repondre({ relais: 'Au Tableau', compte: 'prof@lfbali.com', pret: true }));
    const etat = await bon.ctx.Relais.essayer(EXEC);
    assert.equal(etat.compte, 'prof@lfbali.com');
    assert.ok(bon.demandes[0].includes('ping=1'));

    const autre = lecteur(() => repondre({ bonjour: 'je suis autre chose' }));
    await assert.rejects(autre.ctx.Relais.essayer(EXEC), /pas le relais d/);
});

test('les adresses réglées ici l’emportent sur celles du site, et s’oublient', () => {
    const e = lecteur(() => repondre({}));
    assert.equal(e.ctx.Relais.adresseDe('lfb'), EXEC);
    const autre = 'https://script.google.com/macros/s/AUTRE/exec';
    e.ctx.Relais.poser('lfb', autre);
    assert.equal(e.ctx.Relais.adresseDe('lfb'), autre);
    e.ctx.Relais.poser('lfb', '');
    assert.equal(e.ctx.Relais.adresseDe('lfb'), EXEC, 'on retombe sur celle du site');
});

// L'adresse que donne Apps Script dépend du compte : un établissement (un
// domaine Workspace) reçoit la forme « /a/macros/<domaine>/s/… », que la
// première version refusait — le relais du lycée était donc impossible à
// enregistrer. Et puisque la console propose plusieurs adresses voisines,
// chaque refus doit dire laquelle prendre.
test('les deux formes d’adresse sont acceptées, les fausses expliquées', async () => {
    const e = lecteur(() => repondre({ relais: 'Au Tableau', compte: 'prof@lfbali.com', pret: true }));
    const R = e.ctx.Relais;

    const bonnes = [
        'https://script.google.com/macros/s/AKfy_12345/exec',
        'https://script.google.com/a/macros/lfbali.com/s/AKfy_12345/exec'
    ];
    for (const a of bonnes) {
        assert.equal(R.pourquoiPasValable(a), '', a);
        assert.equal(R.adresseValable(a), true, a);
    }
    // Celle du lycée doit vraiment passer jusqu'au bout.
    const etat = await R.essayer(bonnes[1]);
    assert.equal(etat.compte, 'prof@lfbali.com');

    const mauvaises = [
        ['https://script.google.com/macros/s/AKfy_12345/dev', /\/dev|exec/],
        ['https://script.google.com/home/projects/1aZ/edit', /éditeur/],
        ['https://script.google.com/u/0/home/projects/1aZ/edit', /éditeur/],
        ['https://exemple-pirate.fr/vol', /application Apps Script/],
        ['script.google.com/macros/s/AKfy/exec', /adresse web complète/],
        ['', /Collez/]
    ];
    for (const [a, attendu] of mauvaises) {
        assert.equal(R.adresseValable(a), false, a);
        assert.match(R.pourquoiPasValable(a), attendu, a);
    }
});

// Un relais qui répond mais qui bute — autorisation refusée, déploiement réglé
// sur « l'utilisateur qui accède » — ne doit pas renvoyer au professeur la
// phrase rassurante destinée à l'élève : il perdrait une heure à chercher.
test('quand le relais bute, « Essayer » reçoit la cause, l’élève non', () => {
    const e = script({ panne: true });
    const sondage = lu(e.demander({ ping: '1' }));
    assert.match(sondage.erreur, /a buté/);
    assert.match(sondage.erreur, /permission/);
    assert.match(sondage.erreur, /Exécuter en tant que/);
    assert.equal(sondage.pret, false);

    // L'élève, lui, n'apprend rien de l'intérieur du compte.
    const eleve = lu(e.demander({ id: 'SEANCE_1aaaaaaaaaaaaaaaaaaaa' }));
    assert.match(eleve.erreur, /n’a pas pu être lue|introuvable/);
    assert.equal(/permission|DriveApp/.test(eleve.erreur), false);
});

// Deux comptes Google dans le même navigateur, et l'adresse recopiée depuis
// la barre d'adresse porte un « /u/1/ » : il désigne le deuxième compte
// connecté CHEZ CELUI QUI COPIE, et ne veut rien dire ailleurs. On le retire
// plutôt que de refuser.
test('le « /u/1/ » des comptes multiples est retiré, pas reproché', async () => {
    const e = lecteur(() => repondre({ relais: 'Au Tableau', compte: 'moi@gmail.com', pret: true }));
    const avec = 'https://script.google.com/u/1/macros/s/AKfy_12345/exec';
    assert.equal(e.ctx.Relais.pourquoiPasValable(avec), '');
    await e.ctx.Relais.essayer(avec);
    assert.ok(e.demandes[0].startsWith('https://script.google.com/macros/s/AKfy_12345/exec'), e.demandes[0]);
    assert.equal(e.demandes[0].includes('/u/1/'), false, 'le numéro de compte ne part pas');
});

// Un 404 n'est pas une panne du relais : c'est une adresse qui ne désigne
// aucun déploiement. Le dire évite de chercher du côté du script.
test('un 404 dit d’où reprendre l’adresse', async () => {
    const e = lecteur(() => new Response('', { status: 404 }));
    await assert.rejects(e.ctx.Relais.essayer('https://script.google.com/macros/s/AKfy_12345/exec'),
        /aucun déploiement|Gérer les déploiements/);
});

// Une adresse réglée dans ce navigateur l'emporte sur celle du site — c'est
// ce qui permet de pointer un nouveau déploiement sans attendre une mise à
// jour. Mais elle vieillit, et comme elle gagne, une adresse morte oubliée
// dans un coin cassait toute publication alors que le site, lui, connaissait
// la bonne. Elle doit s'effacer d'elle-même.
test('une adresse locale périmée s’efface dès que celle du site répond', async () => {
    const perimee = 'https://script.google.com/macros/s/PERIMEE_1234567/exec';
    const e = lecteur((url) => url.startsWith(perimee)
        ? new Response('', { status: 404 })
        : repondre(seance('Les suites')));
    e.ctx.Relais.poser('lfb', perimee);
    assert.equal(e.ctx.Relais.adresseDe('lfb'), perimee, 'elle passe d’abord');

    const { contenu } = await e.ctx.Relais.lireLaSeance('lfb', 'SEANCE_1aaaaaaaaaaaaaaaaaaaa');
    assert.equal(contenu.seance.titre, 'Les suites');
    assert.equal(e.demandes.length, 2, 'les deux adresses ont été essayées');
    assert.equal(e.ctx.Relais.adresseDe('lfb'), EXEC, 'la périmée est oubliée');
});

// En revanche, un relais qui répond « je ne vois pas cette séance » n'est pas
// une affaire d'adresse : inutile d'aller demander ailleurs, et surtout pas
// d'effacer un réglage qui n'y est pour rien.
test('un refus du relais n’efface rien et ne se rejoue pas ailleurs', async () => {
    const autre = 'https://script.google.com/macros/s/AUTRE_1234567/exec';
    const e = lecteur(() => repondre({ erreur: 'Séance introuvable ou retirée. Demandez le lien à votre enseignant.' }));
    e.ctx.Relais.poser('lfb', autre);
    await assert.rejects(e.ctx.Relais.lireLaSeance('lfb', 'SEANCE_1aaaaaaaaaaaaaaaaaaaa'), /introuvable ou retirée/);
    assert.equal(e.demandes.length, 1, 'une seule demande');
    assert.equal(e.ctx.Relais.adresseDe('lfb'), autre, 'le réglage est intact');
});
