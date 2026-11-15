export function Disclaimers() {
  return (
    <p className="disclaimers" role="note">
      <strong>Candidate water-change indicator — not a validated flood map.</strong> Not for evacuation or route decisions.
    </p>
  );
}

export function FixtureBanner() {
  return (
    <div className="fixture-banner" role="alert">
      DEV FIXTURE — synthetic development data, not a radar result.
    </div>
  );
}

export function Limits() {
  return (
    <details className="limits">
      <summary>What the radar can and cannot show</summary>
      <ul>
        <li>Smooth water returns little signal, but radar shadow and other smooth surfaces can also look dark.</li>
        <li>Wind, urban areas and flooded vegetation (double bounce) can raise the return over water.</li>
        <li>Not detecting water does not prove there was no flooding.</li>
        <li>A bridge over water may still be passable; a route missing from the road data may exist.</li>
      </ul>
    </details>
  );
}
