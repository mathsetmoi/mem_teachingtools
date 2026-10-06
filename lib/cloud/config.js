// Identifiant client Google, nécessaire au sélecteur de fichiers Drive.
//
// Ce n'est pas un secret : Google le prévoit visible dans la page, et il ne
// donne rien à lui seul. Ce qui protège le compte, c'est la liste des
// « origines JavaScript autorisées » déclarée dans la console Google Cloud :
// n'y mettre QUE le domaine du site. Sans cela, le sélecteur refusera de
// s'ouvrir ailleurs — c'est le comportement voulu.
//
// Laisser vide désactive proprement la fonction : le bouton ne s'affiche pas.
window.AUTABLEAU_DRIVE_CLIENT_ID = '104179953661-2h0q8ada8m22j3d8uhe4ra3rbgfdp83p.apps.googleusercontent.com';

// Clé d'application Dropbox (« App key »). Comme l'identifiant Google, ce
// n'est pas un secret : elle est visible dans la page et ne donne rien à elle
// seule. Ce qui protège les comptes, c'est la liste des « Redirect URIs »
// déclarées dans la console Dropbox — n'y mettre QUE l'adresse du site.
//
// Ne JAMAIS mettre l'« App secret » ici : le navigateur utilise le flux PKCE,
// qui n'en a pas besoin, et un secret publié dans une page est un secret perdu.
//
// Laisser vide est très bien : chaque enseignant peut alors saisir sa propre
// clé dans la fenêtre « Ouvrir un fichier », et elle reste sur sa machine.
window.AUTABLEAU_DROPBOX_APP_KEY = '';

// LES SÉANCES PUBLIÉES. Deux façons de les servir à l'élève.
//
// LE RELAIS (recommandé) : un petit script Apps Script déployé dans VOTRE
// compte lit la séance et la renvoie (relais/relais-seances.gs). Aucune clé
// ne circule, et la séance reste privée dans le Drive. Un relais par compte ;
// le lien de la séance nomme le sien (« ?r=lfb&id=… »), et c'est ici qu'on
// dit à quelle adresse il répond. Ces adresses ne sont pas des secrets : ce
// sont des points d'entrée qui ne servent que les séances publiées.
//
// LA CLÉ D'API : l'ancienne voie, pour les liens déjà distribués. Le lecteur
// la lit encore dans les liens qui la portent.
//
// Le jeton OAuth de publication, lui, reste en mémoire et n'est jamais écrit
// ni ici ni dans un lien.
window.AUTABLEAU_PUBLICATION = {
    cle: '',       // repli : clé d'API Google, restreinte au site et à Drive
    adresse: '',   // adresse publique du site lecteur, vide = ce site
    clientId: '',  // facultatif : sinon AUTABLEAU_DRIVE_CLIENT_ID
    profil: '',    // le compte proposé par défaut : 'lfb', 'mem'…
    profils: [     // les comptes, tels qu'ils s'appellent dans la fenêtre
        // { cle: 'lfb', nom: 'Lycée français de Bali' },
        // { cle: 'mem', nom: 'Perso' }
    ],
    relais: {      // l'adresse « …/exec » du relais déployé dans chaque compte
        // Le compte personnel, déployé et vérifié le 6 octobre 2026.
        mem: 'https://script.google.com/macros/s/AKfycbyjIhYog-9tM4G0VF0AhHHR3iQGvz-5lBjnYeLVGF8HwkmgEYib4-UCkgTjY3OiO6I1Zg/exec'
        // Le compte du lycée, quand son relais sera déployé :
        // lfb: 'https://script.google.com/a/macros/lfbali.com/s/…/exec'
    }
};
