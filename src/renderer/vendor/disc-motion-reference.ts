// @ts-nocheck
// Exact pure motion functions from 3D CD Disc Carousel by Kedhareswer Naidu (MIT).
// Public artifact identity: research/21st-public/disc/SOURCE.json.
const c = (value, _name) => value;
function ku(v, O) {
  return O <= 0 ? 0 : ((v % O) + O) % O;
}
c(ku, "wrapIndex");
function Od(v, O, _) {
  if (O <= 0) return 0;
  const d = Math.round(v);
  return _ ? ku(d, O) : Math.min(Math.max(d, 0), O - 1);
}
c(Od, "indexAt");
function _d(v, O, _, d) {
  const N = v - O;
  return d && _ > 0 ? N - _ * Math.round(N / _) : N;
}
c(_d, "offsetOf");
function m1(v, O) {
  return v < 0 ? v / 3 : v > O - 1 ? O - 1 + (v - (O - 1)) / 3 : v;
}
c(m1, "rubber");
function g1(v, O) {
  const _ = Math.min(Math.max(v, 0), 0.9);
  return {
    omega: (2 * Math.PI) / Math.max(O, 0.1),
    slide: 1 - _ / 2,
    tilt: 1 - _,
  };
}
c(g1, "springOf");
function Dd(v, O, _, d, N, q) {
  const X = Math.max(1, Math.ceil(q / 0.004166666666666667)),
    J = q / X;
  for (let U = 0; U < X; U++)
    ((O += (-d * d * (v - _) - 2 * N * d * O) * J), (v += O * J));
  return [v, O];
}
c(Dd, "springStep");
function b1(v, O, _, d) {
  const N = Math.round(v);
  let q = Math.round(v + O * 0.2);
  return (
    (q = Math.min(Math.max(q, N - 3), N + 3)),
    d ? q : Math.min(Math.max(q, 0), _ - 1)
  );
}
c(b1, "releaseTarget");
function p1(v, O, _, d) {
  if (!d) return Math.min(Math.max(v, 0), _ - 1);
  const N = Math.round(O);
  let q = v - ku(N, _);
  return ((q -= _ * Math.round(q / _)), N + q);
}
c(p1, "targetFor");
function S1(v, O, _) {
  const d = Math.min(O, 2.2);
  return {
    x: v * _.spacing,
    y: -v * _.rise,
    z: d * _.depth,
    yaw: _.yaw + O * _.fan,
    roll: O * _.roll,
    zIndex: 100 + Math.round(O * 10),
    opacity: O < -2.5 ? Math.max(0, 1 - (-O - 2.5) / 1.2) : 1,
    hidden: v < -4 || v > 2.8,
  };
}
c(S1, "poseOf");
export { ku as wrapIndex, Od as indexAt, _d as offsetOf, m1 as rubber, g1 as springOf, Dd as springStep, b1 as releaseTarget, p1 as targetFor, S1 as poseOf };

