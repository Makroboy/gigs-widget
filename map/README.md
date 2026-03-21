# Kemopetrol-keikat kartalla

Staattinen verkkosivu, joka näyttää Kemopetrolin menneet keikat kartalla.

GitHub-repoversio lukee keikkadatan suoraan repojuuren `gigs.js`-tiedostosta. Näin keikkalista ja kartta käyttävät samaa lähdedataa, eikä samoja keikkoja tarvitse ylläpitää kahdessa eri tiedostossa.

## Miksi nettisivu toimii tässä paremmin kuin dmg

- Kartta toimii heti selaimessa ilman asennusta
- Sama näkymä toimii Macissa, puhelimessa ja tabletilla
- Julkaisu on helppo esimerkiksi GitHub Pagesiin tai Cloudflare Pagesiin
- Datan päivittäminen onnistuu ilman uuden app-paketin jakelua

`dmg` kannattaa vasta silloin, jos haluat nimenomaan Mac-only version, offline-käytön tai tiukan native-integraation.

## Käynnistys lokaalisti

1. Avaa terminaali kansioon `/Users/markosoukka/Desktop/Lainausappi/BandKit/gigs-widget`
2. Käynnistä paikallinen palvelin:

```bash
python3 -m http.server 8080
```

3. Avaa selaimessa `http://127.0.0.1:8080/map/`

## Datan päivitys

Kartta lukee keikkadatan suoraan tiedostosta:

- [Makroboy/gigs-widget `gigs.js`](https://github.com/Makroboy/gigs-widget/blob/main/gigs.js)

Jos päivität keikkoja keikkalistasivulle, kartta käyttää samaa dataa automaattisesti. Erillistä `gigs-source.json`-synkkaa ei GitHub Pages -versiossa tarvita.

## Tiedostot

- `index.html` = sivun rakenne
- `styles.css` = ulkoasu ja responsiivisuus
- `app.js` = datan lataus, kartta ja käyttöliittymä
- `data/city-coordinates.json` = kaupunkitason koordinaatit karttaa varten
- `../gigs.js` = kartan käyttämä varsinainen keikkadata repojuuresta

## GitHub Pagesiin turvallisesti

Turvallisin tapa on pitää nykyinen keikkalistasivu ennallaan ja lisätä kartta omaan alikansioonsa samassa repossa.

Suositeltu rakenne repoon:

- repojuuri = nykyinen toimiva keikkalistasivu
- `map/` = tämä karttasivu

Esimerkki:

```text
gigs-widget/
├── index.html
├── gigs.js
├── gigs.json
├── bg.png
├── kemopetrol_logo_optimized.png
└── map/
    ├── index.html
    ├── styles.css
    ├── app.js
    └── data/
        └── city-coordinates.json
```

Tällöin URL:t ovat:

- keikkalista: `https://makroboy.github.io/gigs-widget/`
- kartta: `https://makroboy.github.io/gigs-widget/map/`

Nykyiseen keikkalistasivuun kannattaa lisätä vain yksi linkkinappi karttaan. Esimerkiksi:

```html
<a href="./map/" class="map-link-button">Gigs On Map</a>
```

Kevyt tyyliesimerkki:

```css
.map-link-button{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  padding:8px 12px;
  border-radius:999px;
  border:1px solid #444;
  background:rgba(26,26,26,.92);
  color:#e0e0e0;
  text-decoration:none;
  font:inherit;
}

.map-link-button:hover{
  border-color:#ff8f5a;
  background:rgba(255,143,90,.16);
}
```

Karttasivulla on jo valmiina linkki takaisin keikkalistaan.

## Mitä kartta tarvitsee reposta

Karttasivu tarvitsee toimiakseen nämä:

- repojuuren `gigs.js`
- repojuuren `bg.png`
- repojuuren `kemopetrol_logo_optimized.png`
- kansion `map/` tiedostot

## Jatkokehitys

Seuraava hyödyllinen vaihe on lisätä venue-kohtaiset koordinaatit.
Silloin kartta voi näyttää tarkan keikkapaikan eikä vain kaupungin keskipistettä.
