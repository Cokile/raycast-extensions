import {readFile, writeFile} from "fs/promises";
import {setTimeout} from "timers/promises";

import {closeMainWindow, getPreferenceValues, LaunchProps, showToast, Toast} from "@raycast/api";
import {runAppleScript} from 'run-applescript';
import axios from "axios";

interface Parameters {
  star: number;
  category: string;
  obsidian: boolean;
  telegram: boolean;
}

interface Preferences {
  telegramBotToken: string;
  telegramChatID: string;
  obsidianVaultPath: string;
}

interface Reading {
  url: string;
  title: string;
  category: string;
  star: number;
  date: Date;
}

const star = "";


export default async function Command(props: LaunchProps<{arguments: {parameters: string | undefined}}>) {
  const paramters = extractParameters(props.arguments.parameters);
  const reading = await makeReading(paramters);
  const preferences = getPreferenceValues<Preferences>();

  let success = false
  if (paramters.obsidian) {
    showToast({style: Toast.Style.Animated, title: "Obsidian"})
    if (await recordInObsidian(reading, preferences)) {
      success = true
      showToast({style: Toast.Style.Success, title: "Obsidian"})
    } else {
      showToast({style: Toast.Style.Failure, title: "Obsidian"})
    }
  }

  if (paramters.telegram) {
    showToast({style: Toast.Style.Animated, title: "Telegram"})
    if (await postToTelegram(reading, preferences)) {
      success = true
      showToast({style: Toast.Style.Success, title: "Telegram"})
    } else {
      showToast({style: Toast.Style.Failure, title: "Telegram"})
    }
  }

  if (success) {
    await setTimeout(400);
    await closeMainWindow({clearRootSearch: true});
  }
}

function extractParameters(paramters: string | undefined): Parameters {
  if (paramters == undefined || paramters.length != 3) {
    return {
      star: 3,
      category: "iOS",
      obsidian: true,
      telegram: false
    }
  }

  let category = "iOS"
  if (paramters.charAt(1) == "2") {
    category = "Swift"
  } else if (paramters.charAt(1) == "3") {
    category = "Rust"
  } else if (paramters.charAt(1) == "4") {
    category = "Tech"
  }
  return {
    star: Number(paramters.charAt(0)),
    category: category,
    obsidian: true,
    telegram: paramters.charAt(2) == "a"
  }
}

async function makeReading(paramters: Parameters): Promise<Reading> {
  let script = 'tell application "Google Chrome" to return URL of active tab of front window'
  const url = await runAppleScript(script, {humanReadableOutput: true});
  script = 'tell application "Google Chrome" to return title of active tab of front window';
  const title = await runAppleScript(script, {humanReadableOutput: true});

  return {
    url: url.replace(/(?<=&|\?)utm_.*?(&|$)/gim, ""),
    title: title.replaceAll("<", "(").replaceAll(">", ")").replaceAll("[", "(").replaceAll("]", ")"),
    category: paramters.category,
    star: Math.max(1, Math.min(paramters.star, 5)),
    date: new Date(),
  }
}

async function postToTelegram(reading: Reading, preferences: Preferences): Promise<boolean> {
  const response = await axios.post(`https://api.telegram.org/${preferences.telegramBotToken}/sendMessage`, {
    chat_id: preferences.telegramChatID,
    text: `[${reading.title}](${reading.url})`,
    parse_mode: "Markdown",
  });
  return response.status == 200;
}

async function recordInObsidian(reading: Reading, preferences: Preferences): Promise<boolean> {
  const file_path = `${preferences.obsidianVaultPath}/Articles - ${new Date().getFullYear()}.md`;
  const lines = (await readFile(file_path, {encoding: "utf8"})).split("\n");

  let line_num = 0;
  let in_section = false;
  for (const line of lines) {
    if (line.startsWith(`## ${reading.category}`)) {
      in_section = true;
    } else if (in_section && line_num > 0 && line_num < lines.length) {
      if (line.length == 0 && lines[line_num - 2].startsWith("## ")) {
        break;
      }

      const curr_line_star = starCountOfLine(lines[line_num]);
      const prev_line_star = starCountOfLine(lines[line_num - 1]);
      const next_line_star = starCountOfLine(lines[line_num + 1]);
      if (0 < curr_line_star && curr_line_star < reading.star) {
        break;
      }

      if (prev_line_star == reading.star && next_line_star < reading.star) {
        break;
      }

      if (prev_line_star > reading.star && curr_line_star == 0) {
        break;
      }
    }

    line_num += 1;
  }

  if (line_num == lines.length - 1) {
    return false;
  }

  const text = `- [ ] [${star.repeat(reading.star)} | ${reading.title}](${reading.url}) @{${reading.date.getFullYear()}/${reading.date.getMonth() + 1
    }/${reading.date.getDate()}} @@{${reading.date.getHours()}:${reading.date.getMinutes()}}`;
  lines.splice(line_num, 0, text);
  await writeFile(file_path, lines.join("\n"));

  return true;
}

function starCountOfLine(line: string): number {
  for (const count of [5, 4, 3, 2, 1]) {
    if (line.indexOf(star.repeat(count)) > -1) {
      return count;
    }
  }
  return 0;
}
