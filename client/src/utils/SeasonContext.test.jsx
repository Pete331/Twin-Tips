// The season provider, which every signed-in page waits on.
//
// Both tests are about the same thing from two directions: a season response
// that arrives safely has to be kept. Twice now it has been fetched and then
// thrown away - once when auth resolving re-ran the effect mid-request, and
// once under StrictMode, which unmounts and remounts on every development
// load. Each time the request succeeded and the app sat on its skeleton.

import { StrictMode, useContext } from "react";
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { AuthContext } from "./AuthContext";
import SeasonProvider, { SeasonContext } from "./SeasonContext";
import SeasonAPI from "./SeasonAPI";
import TipsAPI from "./TipsAPI";

vi.mock("./SeasonAPI", () => ({
  default: { getState: vi.fn(), getAvailable: vi.fn() },
}));
vi.mock("./TipsAPI", () => ({ default: { setSeason: vi.fn() } }));

const SeasonShown = () => {
  const { seasonState } = useContext(SeasonContext);
  return <p>{seasonState ? `Season ${seasonState.season}` : "No season"}</p>;
};

const signedIn = { user: { isAuthenticated: true }, checked: true };

const tree = (auth) => (
  <AuthContext.Provider value={auth}>
    <SeasonProvider>
      <SeasonShown />
    </SeasonProvider>
  </AuthContext.Provider>
);

beforeEach(() => {
  vi.clearAllMocks();
  SeasonAPI.getAvailable.mockResolvedValue({ data: { seasons: [2026] } });
});

describe("the season state reaching the page", () => {
  test("survives StrictMode's unmount and remount", async () => {
    SeasonAPI.getState.mockResolvedValue({ data: { season: 2026 } });

    render(<StrictMode>{tree(signedIn)}</StrictMode>);

    expect(await screen.findByText("Season 2026")).toBeInTheDocument();
    expect(TipsAPI.setSeason).toHaveBeenCalledWith(2026);
    // Remounting is not a reason to ask twice: the first request is kept.
    expect(SeasonAPI.getState).toHaveBeenCalledTimes(1);
  });

  test("survives auth answering while the request is in flight", async () => {
    let answer;
    SeasonAPI.getState.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      })
    );

    // Asked for as the page opens, before auth has answered.
    const { rerender } = render(
      tree({ user: { isAuthenticated: false }, checked: false })
    );
    rerender(tree(signedIn));
    answer({ data: { season: 2026 } });

    expect(await screen.findByText("Season 2026")).toBeInTheDocument();
    expect(SeasonAPI.getState).toHaveBeenCalledTimes(1);
  });
});
