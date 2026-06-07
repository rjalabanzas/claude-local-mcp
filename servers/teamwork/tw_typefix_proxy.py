#!/usr/bin/env python3
"""Local stdio MCP proxy wrapping the Teamwork tw-mcp binary.

tw-mcp advertises typed params as anyOf:[{type:T},{type:null}]. MCP clients
flatten that to no-type, so values are sent as strings and the binary rejects
them. This proxy flattens anyOf:[T,null] -> plain type: T and coerces
tools/call arguments to match. Binary path comes from TW_MCP_BIN.
Credentials are read from the environment and passed straight to the child.
"""
import sys, os, json, subprocess, threading

TW_BIN = os.environ.get("TW_MCP_BIN") or "/Users/rjalabanzas/ClaudeOS/Code Repos/teamwork-mcp/tw-mcp"

TOOLTYPES = {}
_lock = threading.Lock()
_NUMBER_NAMES = {"hours"}
_STRING_ARRAY_NAMES = {"companynames", "emails", "domains", "tags", "deletetags",
                       "files", "entities", "options", "predecessors"}
def infer_type(name, prop):
    if "default" in prop and prop["default"] is not None:
        d = prop["default"]
        if isinstance(d, bool):  return ("boolean", None)
        if isinstance(d, int):   return ("integer", None)
        if isinstance(d, float): return ("number", None)
        if isinstance(d, list):  return ("array", "integer")
        if isinstance(d, str):   return ("string", None)
    low = name.lower()
    if low.endswith("_ids") or name.endswith("IDs") or name.endswith("Ids") or low in ("ids",):
        return ("array", "integer")
    if low in _STRING_ARRAY_NAMES:
        return ("array", "string")
    if low in _NUMBER_NAMES:
        return ("number", None)
    if low.endswith("_id") or name.endswith("Id") or low in (
            "id", "page", "page_size", "pagesize", "pageoffset", "limit",
            "offset", "minutes", "seconds", "days_offset", "estimated_minutes",
            "displayorder", "progress"):
        return ("integer", None)
    bool_names = {
        "verbose", "match_all_tags", "billable", "include_contents", "is_utc",
        "running_timers_only", "admin", "includedeleted",
        "include_completed_items", "include_site_level", "only_project_level",
        "only_site_level", "show_deleted", "isparttime", "isprivate",
        "ispublish", "isrequiredreading", "isfullwidth", "isminorchange",
        "notifycustomer", "notify_current_user", "stop_running_timers",
        "running", "enabledforfutureinboxes", "readerinlinecommentsenabled",
        "clear_section", "new_from_template", "to_template",
    }
    if low in bool_names or low.startswith("is_") or low.startswith("include_") \
            or low.startswith("only_") or low.startswith("show_") \
            or low.startswith("has_"):
        return ("boolean", None)
    return ("string", None)


def patch_tool(tool):
    sch = tool.get("inputSchema")
    if not isinstance(sch, dict):
        return {}
    props = sch.get("properties")
    if not isinstance(props, dict):
        return {}
    tmap = {}
    for name, prop in props.items():
        if not isinstance(prop, dict):
            continue
        if "type" in prop:
            t = prop.get("type")
            if t == "array":
                tmap[name] = ("array", (prop.get("items") or {}).get("type"))
            elif t in ("boolean", "integer", "number", "string"):
                tmap[name] = (t, None)
            continue
        if "anyOf" in prop or "oneOf" in prop:
            key = "anyOf" if "anyOf" in prop else "oneOf"
            branches = prop.get(key) or []
            nonnull = [b for b in branches
                       if isinstance(b, dict) and b.get("type") != "null"]
            if len(nonnull) == 1 and nonnull[0].get("type"):
                b = nonnull[0]
                del prop[key]
                for kk in ("type", "items", "enum", "format", "pattern",
                           "properties", "required", "minProperties",
                           "maxProperties", "minimum", "maximum"):
                    if kk in b:
                        prop[kk] = b[kk]
                bt = prop["type"]
                tmap[name] = (("array", (prop.get("items") or {}).get("type"))
                              if bt == "array" else (bt, None))
            else:
                for b in nonnull:
                    bt = b.get("type")
                    if bt:
                        tmap[name] = (("array", (b.get("items") or {}).get("type"))
                                      if bt == "array" else (bt, None))
                        break
            continue
        if "allOf" in prop:
            continue
        typ, items = infer_type(name, prop)
        if typ == "array":
            prop["type"] = "array"
            prop.setdefault("items", {"type": items or "integer"})
        else:
            prop["type"] = typ
        tmap[name] = (typ, items)
    return tmap
def coerce(val, typ, item_typ):
    try:
        if typ == "boolean":
            if isinstance(val, bool): return val
            if isinstance(val, str):
                if val.strip().lower() in ("true", "1", "yes"):  return True
                if val.strip().lower() in ("false", "0", "no"):  return False
            return val
        if typ == "integer":
            if isinstance(val, bool): return val
            if isinstance(val, int):  return val
            if isinstance(val, float) and val.is_integer(): return int(val)
            if isinstance(val, str) and val.strip().lstrip("-").isdigit():
                return int(val.strip())
            return val
        if typ == "number":
            if isinstance(val, (int, float)): return val
            if isinstance(val, str):
                try: return float(val.strip())
                except ValueError: return val
            return val
        if typ == "array":
            if isinstance(val, list):
                return [coerce(x, item_typ, None) for x in val] if item_typ else val
            if isinstance(val, str):
                s = val.strip()
                if s.startswith("["):
                    try:
                        arr = json.loads(s)
                        if isinstance(arr, list):
                            return [coerce(x, item_typ, None) for x in arr]
                    except ValueError:
                        pass
                parts = [p.strip() for p in s.split(",") if p.strip()]
                return [coerce(p, item_typ, None) for p in parts]
            return val
        return val
    except Exception:
        return val


def handle_client_to_server(line, child_stdin):
    try:
        msg = json.loads(line)
    except Exception:
        child_stdin.write(line); child_stdin.flush(); return
    if isinstance(msg, dict) and msg.get("method") == "tools/call":
        params = msg.get("params") or {}
        args = params.get("arguments")
        with _lock:
            tmap = TOOLTYPES.get(params.get("name"))
        if tmap and isinstance(args, dict):
            for k, v in list(args.items()):
                if k in tmap:
                    typ, item_typ = tmap[k]
                    args[k] = coerce(v, typ, item_typ)
        out = (json.dumps(msg) + "\n").encode()
    else:
        out = line
    child_stdin.write(out); child_stdin.flush()


def handle_server_to_client(line, out_stream):
    try:
        msg = json.loads(line)
    except Exception:
        out_stream.write(line); out_stream.flush(); return
    if isinstance(msg, dict) and isinstance(msg.get("result"), dict) \
            and isinstance(msg["result"].get("tools"), list):
        new_map = {}
        for tool in msg["result"]["tools"]:
            if isinstance(tool, dict) and "name" in tool:
                new_map[tool["name"]] = patch_tool(tool)
        with _lock:
            TOOLTYPES.update(new_map)
        out = (json.dumps(msg) + "\n").encode()
    else:
        out = line
    out_stream.write(out); out_stream.flush()


def pump(src, fn, *a):
    for line in iter(src.readline, b""):
        fn(line, *a)


def main():
    child = subprocess.Popen([TW_BIN] + sys.argv[1:],
                             stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                             stderr=sys.stderr, env=os.environ.copy(), bufsize=0)
    threading.Thread(target=pump, args=(sys.stdin.buffer, handle_client_to_server, child.stdin), daemon=True).start()
    threading.Thread(target=pump, args=(child.stdout, handle_server_to_client, sys.stdout.buffer), daemon=True).start()
    child.wait()


if __name__ == "__main__":
    main()
