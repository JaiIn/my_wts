// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import SignupPage from "../../app/signup/page";
import { SignupForm } from "../../src/ui/auth/signup-form";

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
  fireEvent.change(screen.getByLabelText("표시 이름"), {
    target: { value: "로컬 사용자" },
  });
  fireEvent.change(screen.getByLabelText("비밀번호"), {
    target: { value: "x".repeat(10) },
  });
  fireEvent.change(screen.getByLabelText("비밀번호 확인"), {
    target: { value: "x".repeat(10) },
  });
}

describe("signup screen", () => {
  it("renders the frozen signup fields and accessible password metadata", () => {
    render(<SignupPage />);

    expect(screen.getByText("로컬 계정 만들기")).toBeTruthy();
    expect(screen.getByLabelText("사용자명")).toBeTruthy();
    expect(screen.getByLabelText("표시 이름")).toBeTruthy();
    expect(
      (screen.getByLabelText("비밀번호") as HTMLInputElement).autocomplete,
    ).toBe("new-password");
    expect(
      (screen.getByLabelText("비밀번호 확인") as HTMLInputElement).type,
    ).toBe("password");
    expect(screen.getByRole("button", { name: "회원가입" })).toBeTruthy();
  });

  it("shows client validation and confirmation errors without requesting", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<SignupForm />);

    fireEvent.change(screen.getByLabelText("사용자명"), {
      target: { value: "ab" },
    });
    fireEvent.change(screen.getByLabelText("표시 이름"), {
      target: { value: "Valid" },
    });
    fireEvent.change(screen.getByLabelText("비밀번호"), {
      target: { value: "x".repeat(10) },
    });
    fireEvent.change(screen.getByLabelText("비밀번호 확인"), {
      target: { value: "y".repeat(10) },
    });
    fireEvent.click(screen.getByRole("button", { name: "회원가입" }));

    expect(
      await screen.findByText("사용자명은 3자 이상이어야 합니다."),
    ).toBeTruthy();
    expect(screen.getByText("비밀번호 확인이 일치하지 않습니다.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("prevents duplicate requests while submission is pending", async () => {
    let resolveRequest: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<SignupForm />);
    fillValidForm();

    const submit = screen.getByRole("button", { name: "회원가입" });
    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      (
        screen.getByRole("button", {
          name: "가입 처리 중…",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    resolveRequest?.(
      new Response(
        JSON.stringify({
          data: {
            user: {
              id: "usr_test",
              username: "local.user",
              displayName: "로컬 사용자",
            },
          },
          meta: { requestId: "00000000-0000-4000-8000-000000000001" },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );
    await waitFor(() =>
      expect(routerMocks.replace).toHaveBeenCalledWith("/market"),
    );
  });

  it("submits only the BFF contract fields and follows the success flow", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            user: {
              id: "usr_test",
              username: "local.user",
              displayName: "로컬 사용자",
            },
          },
          meta: { requestId: "00000000-0000-4000-8000-000000000001" },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<SignupForm />);
    fillValidForm();

    fireEvent.click(screen.getByRole("button", { name: "회원가입" }));

    await waitFor(() =>
      expect(routerMocks.replace).toHaveBeenCalledWith("/market"),
    );
    expect(routerMocks.refresh).toHaveBeenCalledTimes(1);
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(requestBody).toEqual({
      username: "local.user",
      displayName: "로컬 사용자",
      password: "x".repeat(10),
    });
    expect(requestBody).not.toHaveProperty("passwordConfirmation");
  });

  it("shows the frozen duplicate-user error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              requestId: "00000000-0000-4000-8000-000000000001",
              code: "USERNAME_ALREADY_EXISTS",
              message: "이미 사용 중인 사용자명입니다.",
              retryable: false,
              details: {},
            },
          }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    render(<SignupForm />);
    fillValidForm();

    fireEvent.click(screen.getByRole("button", { name: "회원가입" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "이미 사용 중인 사용자명입니다.",
    );
  });
});
