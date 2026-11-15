// Exportação do modo Aprofundado: formatos de pesquisa e nenhum dado do usuário.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadModes } from "./helpers.mjs";

const { WW } = loadModes();
const AGORA = new Date("2026-11-15T12:00:00Z");

const dados = {
  mes: "2026-07",
  passagens: [
    { n: 4, data: "2026-07-03", trilha: "103_A_163", pol: "HH", passagens_na_orbita: 9, agua_km2: 8.3, cheia_km2: 0, seca_km2: 0,
      na_janela_da_enchente: true, granulo: "NISAR_L2_X", fonte: "NASA/ISRO NISAR via ASF DAAC",
      // campos extras que NÃO podem vazar para o arquivo
      imagens: { radar: "/x" }, email: "pessoa@exemplo.com", token: "segredo" },
    { n: 7, data: "2026-07-23", trilha: "053_D_103", pol: "HH", passagens_na_orbita: 10, agua_km2: 2.9, cheia_km2: 0.2, seca_km2: 0,
      na_janela_da_enchente: true, granulo: 'NISAR,"com vírgula"', fonte: "NASA/ISRO NISAR via ASF DAAC" },
  ],
  poligonos: [
    { data: "2026-07-23", trilha: "053_D_103", classe: "cheia", area_m2: 1234, centroide_lat: -29.17, centroide_lon: -51.88, municipio: "Muçum", usuario: "x" },
  ],
  municipios: [{ id: "4312609", nome: "Muçum", cheia_km2: 0.011, seca_km2: 0, toca_area_coberta: true, email: "nao@vaza.com" }],
  metadados: { local: "Vale do Taquari (RS)", satelite: "NISAR (NASA/ISRO)", polarizacao: ["HH"], area_coberta: { sul: -29.55 } },
  usuario: { nome: "Pessoa", email: "pessoa@exemplo.com" },
};

test("JSON: pacote completo com proveniência, unidades e sistema de coordenadas", () => {
  const f = WW.exportData(dados, "json", AGORA);
  assert.equal(f.filename, "water-waltz_pacote-pesquisa_2026-07.json");
  assert.match(f.mime, /^application\/json/);
  const body = JSON.parse(f.content);
  assert.equal(body.schema, "water-waltz/pacote-pesquisa@1");
  assert.equal(body.gerado_em, "2026-11-15T12:00:00.000Z");
  assert.equal(body.crs, "EPSG:4326 (WGS 84, graus)");
  assert.match(body.citacao, /NISAR/);
  assert.equal(body.passagens.length, 2);
  assert.equal(body.poligonos[0].municipio, "Muçum");
  assert.equal(body.municipios[0].nome, "Muçum");
});

test("nenhum dado do usuário entra no arquivo, em nenhum formato", () => {
  for (const fmt of ["json", "csv-passagens", "csv-poligonos"]) {
    const { content } = WW.exportData(dados, fmt, AGORA);
    assert.doesNotMatch(content, /pessoa@exemplo\.com|segredo|nao@vaza\.com/, fmt);
    assert.doesNotMatch(content, /"usuario"|"token"|"email"/, fmt);
  }
  const body = JSON.parse(WW.exportData(dados, "json", AGORA).content);
  assert.match(body.privacidade, /Nenhum dado da sua conta/);
});

test("CSV de passagens: cabeçalho fixo, uma linha por passagem e escape correto", () => {
  const f = WW.exportData(dados, "csv-passagens", AGORA);
  assert.equal(f.filename, "water-waltz_passagens_2026-07.csv");
  const lines = f.content.trim().split("\n");
  assert.equal(lines[0], "n,data,trilha,pol,passagens_na_orbita,agua_km2,cheia_km2,seca_km2,na_janela_da_enchente,granulo,fonte");
  assert.equal(lines.length, 3);
  assert.ok(lines[2].includes('"NISAR,""com vírgula"""'), "vírgula e aspas escapadas");
});

test("CSV de polígonos traz centróide, área e município", () => {
  const f = WW.exportData(dados, "csv-poligonos", AGORA);
  const [head, row] = f.content.trim().split("\n");
  assert.equal(head, "data,trilha,classe,area_m2,centroide_lat,centroide_lon,municipio");
  assert.equal(row, "2026-07-23,053_D_103,cheia,1234,-29.17,-51.88,Muçum");
});

test("formato desconhecido é recusado", () => {
  assert.throws(() => WW.exportData(dados, "xlsx"), /Formato inválido/);
});
