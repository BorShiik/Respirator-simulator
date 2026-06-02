# PulmoFlow — Landing Page

Statyczny sайт-презentacja projektu PulmoFlow.

## Uruchomienie

### Opcja 1: Otwórz bezpośrednio
```bash
open index.html
```
> ⚠️ Dla 3D modelu (`<model-viewer>`) potrzebny jest serwer HTTP — otwieranie pliku przez `file://` może nie załadować modelu.

### Opcja 2: Lokalny serwer (zalecane)
```bash
npx -y serve .
```
Otworzy się na `http://localhost:3000`

### Opcja 3: Python
```bash
python3 -m http.server 8000
```
Otworzy się na `http://localhost:8000`

## Dodawanie materiałów

Umieść pliki w katalogu `assets/`:

| Plik | Opis |
|------|------|
| `respirator-model.glb` | 3D model respiratora (format GLB) |
| `student-main.png` | Screenshot panelu studenta |
| `student-async.png` | Screenshot z asynchronią |
| `student-learn.png` | Screenshot trybu nauki |
| `trainer-dashboard.png` | Screenshot dashboardu trenera |
| `trainer-station.png` | Screenshot szczegółów stacji |
| `trainer-scenarios.png` | Screenshot edytora scenariuszy |
| `trainer-analytics.png` | Screenshot analityki |
| `device-full.jpg` | Zdjęcie urządzenia |
| `device-screen.jpg` | Zdjęcie ekranu |
| `device-multi.jpg` | Zdjęcie wielu urządzeń (opcjonalne) |

Strona automatycznie pokaże placeholder jeśli plik nie istnieje.

## Deploy na GitHub Pages

```bash
# Z katalogu głównego repozytorium
git add landing-site/
git commit -m "Add landing page"
git push

# W GitHub: Settings → Pages → Source: Deploy from branch → /landing-site
```

## Technologie

- HTML5 + CSS3 + Vanilla JavaScript
- [model-viewer](https://modelviewer.dev/) (Google) — 3D model
- [Inter](https://fonts.google.com/specimen/Inter) + [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) — fonty
