import axios from "axios";
import { SMSBOWER_API_KEY, SMSBOWER_BASE } from "../config.js";

const api = axios.create({ baseURL: SMSBOWER_BASE, timeout: 15000 });

function params(extra: Record<string, string | number>) {
  return { params: { api_key: SMSBOWER_API_KEY, ...extra } };
}

export interface CountryInfo {
  id: number;
  name: string;
}

export interface ProviderInfo {
  id: number;
  price: number;
  count: number;
}

export interface PriceEntry {
  cost: number;
  count: number;
}

export async function getBalance(): Promise<number> {
  const { data } = await api.get("", params({ action: "getBalance" }));
  if (typeof data === "string" && data.startsWith("ACCESS_BALANCE:")) {
    return parseFloat(data.split(":")[1]!);
  }
  throw new Error("Failed to get balance: " + data);
}

export async function getCountries(): Promise<CountryInfo[]> {
  const { data } = await api.get("", params({ action: "getCountries" }));
  if (typeof data === "object" && data !== null) {
    return Object.entries(data as Record<string, string>).map(([id, name]) => ({
      id: parseInt(id, 10),
      name: String(name),
    }));
  }
  return [];
}

export async function getPricesV3(
  service: string,
): Promise<Record<string, Record<string, PriceEntry[]>>> {
  const { data } = await api.get(
    "",
    params({ action: "getPricesV3", service }),
  );
  return data as Record<string, Record<string, PriceEntry[]>>;
}

export async function getAvailableCountriesForService(
  service: string,
): Promise<Array<{ countryId: number; providers: ProviderInfo[] }>> {
  const prices = await getPricesV3(service);
  const result: Array<{ countryId: number; providers: ProviderInfo[] }> = [];

  for (const [countryId, services] of Object.entries(prices)) {
    const serviceData = services[service];
    if (!serviceData || !Array.isArray(serviceData)) continue;

    const providers: ProviderInfo[] = serviceData
      .map((entry, idx) => ({
        id: idx,
        price: entry.cost,
        count: entry.count,
      }))
      .filter((p) => p.count > 0);

    if (providers.length > 0) {
      result.push({ countryId: parseInt(countryId, 10), providers });
    }
  }

  return result;
}

export interface BuyResult {
  activationId: string;
  phoneNumber: string;
}

export async function buyNumber(
  service: string,
  country: number,
  maxPrice: number,
  providerId?: number,
): Promise<BuyResult> {
  const p: Record<string, string | number> = {
    action: "getNumber",
    service,
    country,
    maxPrice,
  };
  if (providerId !== undefined) {
    p["providerIds"] = providerId;
  }

  const { data } = await api.get("", params(p));
  if (typeof data === "string") {
    if (data === "NO_NUMBERS") throw new Error("NO_NUMBERS");
    if (data === "BAD_KEY") throw new Error("BAD_KEY");
    if (data === "BAD_SERVICE") throw new Error("BAD_SERVICE");
    if (data.startsWith("ACCESS_NUMBER:")) {
      const parts = data.split(":");
      return {
        activationId: parts[1]!,
        phoneNumber: parts[2]!,
      };
    }
  }
  throw new Error("Buy failed: " + JSON.stringify(data));
}

export async function getStatus(activationId: string): Promise<string> {
  const { data } = await api.get(
    "",
    params({ action: "getStatus", id: activationId }),
  );
  return String(data);
}

export async function setStatus(
  activationId: string,
  status: 1 | 3 | 6 | 8,
): Promise<string> {
  const { data } = await api.get(
    "",
    params({ action: "setStatus", id: activationId, status }),
  );
  return String(data);
}

export async function cancelNumber(activationId: string): Promise<void> {
  await setStatus(activationId, 8);
}
