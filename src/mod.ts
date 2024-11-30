import { type Page } from "playwright";
import { expect } from "@playwright/test";
import "./style.css";

export * from "./Richest";

export type TestFn = (context: {
  page: Page;
  expect: typeof expect;
}) => Promise<void> | void;
