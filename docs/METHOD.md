# Method

No trained model is used. Every parameter is recorded in `data/demo/manifest.json`.

## Steps

1. **Read the real science variable.** Record the HDF5 path, units, invalid values and grid of each product. *[to verify on the first real GCOV file — nothing about its structure is assumed here]*
2. **Convert to dB only when needed.** `10·log10(x)` is applied only to strictly positive linear power, never to data already in dB.
3. **Align grids** and use the **intersection of valid pixels** of both dates.
4. **Candidate water**: backscatter below a documented threshold (value and justification recorded per sensor). *[threshold to be chosen and justified on real data]*
5. **Classify change** between a date and the previous date of the same sensor: persistent water, candidate expansion, candidate retraction, no valid observation.
6. **History**: per cell, *k* acquisitions with candidate water out of *n* valid acquisitions (*N* total).
7. **Statistics** per date and per locality (km², valid fraction).
8. **Access ("affected without being flooded")**, with three outcomes only:
   - documented, dated interruption near the home → "Interruption confirmed by [source] at [time]" (external);
   - candidate water over a mapped road or bridge near the home → "Section requiring verification" (inference);
   - otherwise → "Isolation not demonstrated" (inference).
   No network-connectivity routing is claimed.

## Physical limits

- Smooth water has low backscatter, but radar shadow and other smooth surfaces can also look dark.
- Wind, urban areas and flooded vegetation (double bounce) can increase the return.
- Not detecting water does not prove there was no flooding.
- A bridge over water may still be passable; a route missing from the road data may exist.

## Implementation

- `pipeline/common.py`: grid format, change classes, rendering, statistics, manifest.
- `backend/app/services/exposure.py`: "Is my area affected?" (mirrored in the frontend for the static demo).
