import { describe, it, expect } from "vitest";
import { parseGithubRepoUrl } from "../services/githubWorkspaceService.js";

describe("parseGithubRepoUrl", () => {
  it("parses https github.com URLs", () => {
    expect(parseGithubRepoUrl("https://github.com/foo/bar")).toEqual({
      owner: "foo",
      repo: "bar",
      cloneHttpsUrl: "https://github.com/foo/bar.git",
    });
    expect(parseGithubRepoUrl("https://github.com/foo/bar.git")).toEqual({
      owner: "foo",
      repo: "bar",
      cloneHttpsUrl: "https://github.com/foo/bar.git",
    });
  });

  it("parses git@ URLs", () => {
    expect(parseGithubRepoUrl("git@github.com:foo/bar.git")).toEqual({
      owner: "foo",
      repo: "bar",
      cloneHttpsUrl: "https://github.com/foo/bar.git",
    });
  });

  it("parses owner/repo shorthand", () => {
    expect(parseGithubRepoUrl("octocat/Hello-World")).toEqual({
      owner: "octocat",
      repo: "Hello-World",
      cloneHttpsUrl: "https://github.com/octocat/Hello-World.git",
    });
  });

  it("rejects non-GitHub hosts and invalid URLs", () => {
    expect(parseGithubRepoUrl("https://gitlab.com/foo/bar")).toBeNull();
    expect(parseGithubRepoUrl("not-a-url")).toBeNull();
    expect(parseGithubRepoUrl("")).toBeNull();
  });
});
