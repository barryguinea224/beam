'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const svg = fs.readFileSync(path.join(__dirname, '../travel/assets/world-map.svg'), 'utf8');
const countries = [...svg.matchAll(/<path id="map-([A-Z]{2})" data-country="\1" d="([^"]+)"\/>/g)];

assert.equal(countries.length, 174, 'Country path count changed unexpectedly');
assert.equal(new Set(countries.map(match => match[1])).size, countries.length, 'Duplicate country IDs');
for (const code of ['FR', 'GN', 'BR']) {
  assert.ok(countries.some(match => match[1] === code), 'Missing country ' + code);
}

const france = countries.find(match => match[1] === 'FR')[2];
const polygons = france.match(/M[^M]+Z/g) || [];
assert.equal(polygons.length, 2, 'FR should retain mainland France and Corsica, without Guyane');

// Natural Earth SVG uses an equirectangular projection with 1000px for 360°.
// A geometry's projected bounding-box centre is sufficient to identify its region.
function geographicCentre(polygon) {
  const points = [...polygon.matchAll(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g)]
    .map(match => [Number(match[1]), Number(match[2])]);
  assert.ok(points.length >= 3, 'Invalid polygon');
  const x = (Math.min(...points.map(point => point[0])) + Math.max(...points.map(point => point[0]))) / 2;
  const y = (Math.min(...points.map(point => point[1])) + Math.max(...points.map(point => point[1]))) / 2;
  return { lon: x * 360 / 1000 - 180, lat: 90 - y * 360 / 1000 };
}

const centres = polygons.map(geographicCentre);
for (const { lon, lat } of centres) {
  assert.ok(lon >= -6 && lon <= 10 && lat >= 41 && lat <= 52,
    'FR includes a non-metropolitan polygon at ' + lon + ', ' + lat);
}
assert.ok(centres.some(p => p.lat > 44 && p.lon < 7), 'Mainland France absent');
assert.ok(centres.some(p => p.lat < 44 && p.lon > 7), 'Corsica absent');
console.log('PASS: FR highlights mainland France + Corsica, not Guyane; other countries present.');
