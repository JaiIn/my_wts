// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import LoginPage from "../../app/login/page";
import { LoginForm } from "../../src/ui/auth/login-form";
import { resolveLoginDestination } from "../../src/ui/auth/login-path";

const routerMocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMocks,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function fillValidForm() {
  fireEvent.change(screen.getByLabelText("사용자명"), {
    target: { value: "local.user" },
  });
  fireEvent.change(screen.getByLabelText("비밀번호"), {
    target: { value: "x".repeat(10) },
  });
}

describe("login screen", () => {
  it("renders the frozen fields and accessible credential metadata", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("로컬 계정 로그인")).toBeTruthy();
    expect(screen.getByLabelText("사용자명")).toBeTruthy();
    const credentialField = screen.getByLabelText(
      "비밀번호",
    ) as HTMLInputElement;
    expect(credentialField.type).toBe("password");
    expect(credentialField.autocomplete).toBe("current-password");
    expect(screen.getByRole("button", { name: "로그인" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "회원가입" })).toBeTruthy();
  });

  it("shows client validation errors without requesting", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<LoginForm destination="/market" />);

    fireEvent.change(screen.getByLabelText("사용자명"), {
      target: { value: "ab" },
    });
    fireEvent.change(screen.getByLabelText("비밀번호"), {
      target: { value: "short" },
    });
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));

    expect(
      await screen.findByText("사용자명은 3자 이상이어야 합니다."),
    ).toBeTruthy();
    expect(screen.getByText("비밀번호는 10자 이상이어야 합니다.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("prevents duplicate requests while submission is pending", () => {
    const fetchMock = vi.fn(() => new Promise<Response>(() => undefined));
    vi.stubGlobal("fetch", fetchMock);
    render(<LoginForm destination="/market" />);
    fillValidForm();

    const submit = screen.getByRole("button", { name: "로그인" });
    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      (
        screen.getByRole("button", {
          name: "로그인 처리 중…",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("shows the same generic authentication failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              requestId: "00000000-0000-4000-8000-000000000002",
              code: "INVALID_CREDENTIALS",
              message: "사용자명 또는 비밀번호를 확인해 주세요.",
              retryable: false,
              details: {},
            },
          }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    render(<LoginForm destination="/market" />);
    fillValidForm();

    fireEvent.click(screen.getByRole("button", { name: "로그인" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "사용자명 또는 비밀번호를 확인해 주세요.",
    );
    expect(routerMocks.replace).not.toHaveBeenCalled();
  });

  it("submits only the login contract and follows the safe next path", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<LoginForm destination="/portfolio" />);
    fillValidForm();

    fireEvent.click(screen.getByRole("button", { name: "로그인" }));

    await waitFor(() =>
      expect(routerMocks.replace).toHaveBeenCalledWith("/portfolio"),
    );
    expect(routerMocks.refresh).toHaveBeenCalledTimes(1);
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(requestBody).toEqual({
      username: "local.user",
      password: "x".repeat(10),
    });
  });

  it("blocks external and protocol-relative next destinations", () => {
    expect(resolveLoginDestination("/orders?status=OPEN")).toBe(
      "/orders?status=OPEN",
    );
    expect(resolveLoginDestination("https://example.com")).toBe("/market");
    expect(resolveLoginDestination("//example.com")).toBe("/market");
    expect(resolveLoginDestination("/\\example.com")).toBe("/market");
    expect(resolveLoginDestination(undefined)).toBe("/market");
  });
});
