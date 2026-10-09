// LA CALCULATRICE NUMWORKS DANS LE REPLAY.
//
// « NumWorks ne fonctionne pas vraiment dans le replay » : la calculatrice
// s'y montrait neuve, sans aucun des calculs faits en classe, ou pas du tout
// quand elle avait été posée à l'écart de ce qu'on écrivait.
//
// L'émulateur vient de numworks.com : on le remplace ici par un faux, qui
// tient un écran de 320 × 240 comme le vrai. On vérifie que :
//   — l'écran photographié après une saisie part dans la séance, étape par
//     étape ;
//   — le lecteur remontre, à chaque étape, l'écran de ce moment-là, et rend
//     la calculatrice à l'élève qui veut s'en servir ;
//   — la vue du lecteur va chercher une calculatrice qui s'ouvre hors champ.
const { creerRapport, ouvrirApp, APP_URL } = require('./harness.cjs');

// Le faux émulateur : un écran, sur lequel le test écrit ce qu'il veut.
const FAUX_EMULATEUR = `(function () {
    function poser() {
        if (document.getElementById('faux-ecran') || !document.body) return;
        var calc = document.createElement('div');
        calc.className = 'calculator';
        var c = document.createElement('canvas');
        c.id = 'faux-ecran'; c.width = 320; c.height = 240;
        calc.appendChild(c);
        document.body.appendChild(calc);
        window.ecrireSurLEcran = function (texte, couleur) {
            var ctx = c.getContext('2d');
            ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 320, 240);
            ctx.fillStyle = couleur || '#000000'; ctx.font = '40px sans-serif';
            ctx.fillText(texte, 20, 120);
        };
        window.ecrireSurLEcran('');
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', poser);
    else poser();
})();`;

async function fauxNumworks(context) {
    await context.route('https://cdn.numworks.com/**', route => {
        const js = route.request().url().endsWith('.js');
        route.fulfill({ status: 200, contentType: js ? 'application/javascript' : 'text/css', body: js ? FAUX_EMULATEUR : '' });
    });
}

module.exports = async function (browser) {
    const r = creerRapport('NumWorks dans le replay');

    // 1. En classe : ce qu'on tape sur la calculatrice part dans la séance.
    const { context, page, erreurs } = await ouvrirApp(browser);
    let seance;
    try {
        await fauxNumworks(context);
        const pasAvant = await page.evaluate(() => {
            const url = new URL('lib/numworks/calculatrice.html?modele=lycee', document.baseURI).href;
            htmlPostits.push({ id: nextId++, x: (innerWidth / 2 - panX) / zoom - 165, y: 40, w: 330, h: 600,
                mode: 'web', url, titre: 'NumWorks lycée', content: '', bg: '#ffffff', minimized: false, ancre: 'tableau', z: globalZ++ });
            saveState(); renderHtmlPostits();
            return filmPas.length;
        });
        const cadre = await (async () => {
            for (let i = 0; i < 100; i++) {
                const f = page.frames().find(x => x.url().includes('numworks/calculatrice.html'));
                if (f) { try { await f.waitForFunction(() => !!window.ecrireSurLEcran, null, { timeout: 5000 }); return f; } catch (e) { /* pas encore */ } }
                await page.waitForTimeout(100);
            }
            return null;
        })();
        r.verifie('la calculatrice se pose et son écran est là', !!cadre);

        const taper = async (texte, couleur) => {
            await cadre.evaluate(([t, c]) => {
                window.ecrireSurLEcran(t, c);
                document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
            }, [texte, couleur]);
            await page.waitForTimeout(800);
            return page.evaluate(() => ({ ecran: htmlPostits[0].ecran || '', pas: filmPas.length }));
        };
        const un = await taper('2+3', '#c0392b');
        r.verifie('après une saisie, l\'écran est rangé sur la fenêtre', /^data:image\/png;base64,/.test(un.ecran), un.ecran.slice(0, 40));
        r.egal('et il fait une étape du film', un.pas, pasAvant + 1);
        const deux = await taper('= 5', '#2980b9');
        r.verifie('une nouvelle saisie donne un nouvel écran, et une nouvelle étape',
            deux.ecran !== un.ecran && deux.pas === un.pas + 1, JSON.stringify({ pas: deux.pas }));
        await page.waitForTimeout(1500);   // la seconde photo, une fois l'écran posé : rien n'a changé
        r.egal('un écran qui n\'a pas changé n\'ajoute rien', await page.evaluate(() => filmPas.length), deux.pas);
        seance = await page.evaluate(() => { syncPage(); return stateForStorage(); });
        seance.__ecrans = [un.ecran, deux.ecran];
        r.verifie('aucune erreur JavaScript en classe', erreurs.length === 0, erreurs.join(' | '));
    } finally { await context.close(); }

    // 2. Le replay remontre l'écran de chaque moment.
    const ctxLecteur = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    await fauxNumworks(ctxLecteur);
    const p = await ctxLecteur.newPage();
    const erreursLecteur = [];
    p.on('pageerror', e => {
        if (!/jsPDF|pdfjsLib|localforage is not defined|getUserMedia|mediaDevices|ResizeObserver loop/.test(e.message)) erreursLecteur.push(e.message);
    });
    try {
        await p.goto(APP_URL + '?lecteur=1');
        await p.waitForFunction(() => window.Lecteur && window.PluginManager);
        const [ecran1, ecran2] = seance.__ecrans;
        delete seance.__ecrans;
        const vu = await p.evaluate(async ([data, e1, e2]) => {
            await Lecteur.charger({ name: 'Calculatrice', data });
            const film = Lecteur.seance.pages[0].film.length;
            const voile = () => {
                const v = document.querySelector('.nw-ecran-replay');
                return v ? v.querySelector('img').getAttribute('src') : null;
            };
            const ou = (e) => e === e1 ? 'ecran1' : e === e2 ? 'ecran2' : e === null ? 'rien' : 'autre';
            const out = {};
            Lecteur.poser(film - 3); out.avantSaisie = ou(voile());
            Lecteur.poser(film - 2); out.premier = ou(voile());
            Lecteur.poser(film - 1); out.second = ou(voile());
            document.querySelector('.nw-ecran-replay button').click();
            out.rendue = ou(voile());
            Lecteur.poser(film - 2); out.retour = ou(voile());
            return out;
        }, [seance, ecran1, ecran2]);
        r.egal('avant la première saisie, la calculatrice est là, sans écran rejoué', vu.avantSaisie, 'rien');
        r.egal('à l\'étape de la saisie, l\'écran de ce moment-là', vu.premier, 'ecran1');
        r.egal('puis celui de la saisie suivante', vu.second, 'ecran2');
        r.egal('« Utiliser la calculatrice » la rend à l\'élève', vu.rendue, 'rien');
        r.egal('et l\'écran revient dès que la séance en montre un autre', vu.retour, 'ecran1');

        // 3. Une calculatrice ouverte loin de ce qu'on écrivait : la vue la suit.
        const suivie = await p.evaluate(async () => {
            const vide = () => Object.fromEntries(FILM_FAMILLES.map(f => [f, []]));
            const trait = { id: 1, color: '#222222', width: 4, points: [{ x: 100, y: 100 }, { x: 300, y: 100 }] };
            const calc = { id: 2, x: 4000, y: 3000, w: 330, h: 600, mode: 'web', url: 'about:blank', titre: 'NumWorks lycée',
                content: '', bg: '#ffffff', minimized: false, ancre: 'tableau', z: 3 };
            const film = [vide(), { freehands: [trait] }, { htmlPostits: [calc] }];
            await Lecteur.charger({ name: 'Loin', data: { nextId: 9, globalZ: 9, currentBgIndex: 0,
                pages: [{ ...vide(), freehands: [trait], htmlPostits: [calc], film }] } });
            // Au chargement, le lecteur cadre toute la page : la fenêtre doit
            // être là où le cadrage met le tableau, pas là où elle était avant.
            const el = document.querySelector('#html-postits-container .html-postit');
            const cadree = Math.abs(parseFloat(el.style.left) - (calc.x * zoom + panX)) < 1
                && Math.abs(parseFloat(el.style.top) - (calc.y * zoom + panY)) < 1;
            Lecteur.seance.suivre = true;
            Lecteur.poser(1, { sansSuivi: true });
            zoom = 1; panX = 0; panY = 0; draw(); renderHtmlPostits();
            Lecteur.poser(2);
            await new Promise(ok => setTimeout(ok, 1500));
            const b = document.querySelector('#html-postits-container .html-postit').getBoundingClientRect();
            return { cadree, x: Math.round(b.x), y: Math.round(b.y), l: innerWidth, h: innerHeight,
                visible: b.right > 0 && b.bottom > 0 && b.left < innerWidth && b.top < innerHeight };
        });
        r.verifie('au chargement, la calculatrice suit le cadrage de la page', suivie.cadree, JSON.stringify(suivie));
        r.verifie('une calculatrice qui s\'ouvre hors champ est amenée dans la vue', suivie.visible, JSON.stringify(suivie));
        r.verifie('aucune erreur JavaScript dans le lecteur', erreursLecteur.length === 0, erreursLecteur.join(' | '));
    } finally { await ctxLecteur.close(); }

    return r.bilan();
};
