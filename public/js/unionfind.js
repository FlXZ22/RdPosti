/*
 * Union-Find (Disjoint Set Union) con path compression e union by rank.
 * Serve a capire quali banchi sono "attaccati" tra loro e formano un unico gruppo.
 */
(function (root) {
  class UnionFind {
    constructor(n) {
      this.parent = Array.from({ length: n }, (_, i) => i);
      this.rank = new Array(n).fill(0);
    }

    find(x) {
      while (this.parent[x] !== x) {
        this.parent[x] = this.parent[this.parent[x]]; // path halving
        x = this.parent[x];
      }
      return x;
    }

    union(a, b) {
      const ra = this.find(a);
      const rb = this.find(b);
      if (ra === rb) return false;
      if (this.rank[ra] < this.rank[rb]) this.parent[ra] = rb;
      else if (this.rank[ra] > this.rank[rb]) this.parent[rb] = ra;
      else {
        this.parent[rb] = ra;
        this.rank[ra]++;
      }
      return true;
    }
  }

  root.RdPosti = root.RdPosti || {};
  root.RdPosti.UnionFind = UnionFind;
  if (typeof module !== 'undefined' && module.exports) module.exports = { UnionFind };
})(typeof window !== 'undefined' ? window : globalThis);
