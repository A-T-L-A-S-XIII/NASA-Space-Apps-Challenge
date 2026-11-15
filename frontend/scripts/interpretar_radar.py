"""
"Agente" de interpretação: lê a cena de radar NISAR (HH) e gera um mapa ilustrado
(água permanente, área urbana, mata, lavoura) no estilo de ilustração plana.
Uso: python3 interpretar_radar.py <radar_antes.png> <saida_dir>
"""
import sys
import numpy as np
from PIL import Image, ImageFilter, ImageDraw
from scipy import ndimage as ndi

src, out = sys.argv[1], sys.argv[2]
a = np.array(Image.open(src))
valido = a[..., 3] > 0
g = a[..., 0].copy(); g[~valido] = int(np.median(a[..., 0][valido]))  # evita borda escura no desfoque
g = g.astype(np.uint8)
H, W = g.shape
blur = lambda arr, r: np.array(Image.fromarray(arr).filter(ImageFilter.GaussianBlur(r))).astype(float)

# 1) ÁGUA PERMANENTE: retroespalhamento baixo e contínuo (rios/lagos)
s2 = blur(g, 2.5)
agua = (s2 < 128) & valido
agua = ndi.binary_opening(agua, iterations=1)
lab, n = ndi.label(agua)
tam = ndi.sum(agua, lab, range(1, n + 1))
agua = np.isin(lab, np.where(tam > 900)[0] + 1)          # só corpos d'água grandes (rio)
agua = ndi.binary_closing(agua, iterations=3)
agua = ndi.binary_dilation(agua, iterations=2)

# 2) URBANO: retroespalhamento muito alto em manchas (dupla reflexão de prédios)
s6 = blur(g, 6)
urb = (s6 > 205) & valido & ~agua
urb = ndi.binary_opening(urb, iterations=2)
lab, n = ndi.label(urb)
tam = ndi.sum(urb, lab, range(1, n + 1))
urb = np.isin(lab, np.where(tam > 600)[0] + 1)
urb = ndi.binary_closing(urb, iterations=4)

# 3) MATA x LAVOURA: média local em escala grande + textura
s14 = blur(g, 14)
mata = (s14 < 172) & valido & ~agua & ~urb
lav_clara = (s14 >= 184) & valido & ~agua & ~urb

# paleta da ilustração (tons da primeira imagem de referência)
COR = {
    'fundo': (224, 222, 196), 'lav': (197, 198, 141), 'lav2': (184, 203, 140), 'campo': (169, 196, 128),
    'mata': (111, 150, 101), 'urb': (222, 197, 175), 'urb_borda': (190, 160, 140), 'agua': (67, 101, 126),
}
img = np.zeros((H, W, 3), np.uint8); img[:] = COR['campo']
# retalhos de lavoura: quantiza a textura média em faixas para dar o aspecto "colcha"
s4 = blur(g, 4)
img[(s4 > 182) & valido] = COR['lav2']
img[lav_clara] = COR['lav']
img[mata] = COR['mata']
img[urb] = COR['urb']
borda_urb = urb & ~ndi.binary_erosion(urb, iterations=2)
img[borda_urb] = COR['urb_borda']
img[agua] = COR['agua']
alpha = np.where(valido, 255, 0).astype(np.uint8)
base = Image.fromarray(np.dstack([img, alpha]), 'RGBA')

# quarteirões dentro das áreas urbanas (grade leve, como na ilustração)
d = ImageDraw.Draw(base)
ys, xs = np.where(urb)
passo = 22
for y in range(0, H, passo):
    for x in range(0, W, passo):
        if urb[min(y + 8, H - 1), min(x + 8, W - 1)] and urb[min(y + 14, H - 1), min(x + 14, W - 1)]:
            d.rectangle([x + 4, y + 4, x + 16, y + 14], fill=(250, 246, 238, 255))
# margens do rio levemente mais claras (mata ciliar)
ciliar = ndi.binary_dilation(agua, iterations=6) & ~agua & valido & ~urb
arr = np.array(base); arr[ciliar, :3] = (126, 168, 108); base = Image.fromarray(arr, 'RGBA')

base = base.filter(ImageFilter.SMOOTH)
base.save(f'{out}/ilustrado.png', optimize=True)
fr = {k: float(v.sum() / valido.sum()) for k, v in [('agua', agua), ('urbano', urb), ('mata', mata)]}
print('frações', {k: round(v, 3) for k, v in fr.items()})

# versão "depois": mesma ilustração + água nova (máscara do NISAR) em azul vivo com contorno claro
m = np.array(Image.open(sys.argv[3]))[..., 3] > 0 if len(sys.argv) > 3 else None
if m is not None:
    m = ndi.binary_dilation(m, iterations=2)
    contorno = ndi.binary_dilation(m, iterations=2) & ~m
    arr = np.array(base)
    arr[contorno & valido, :3] = (245, 250, 255)
    arr[m & valido, :3] = (42, 163, 184)   # azul Water Waltz (#2AA3B8)
    Image.fromarray(arr, 'RGBA').save(f'{out}/ilustrado_depois.png', optimize=True)
