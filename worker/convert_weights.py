"""HuggingFace TimesFM 2.5の旧形式重みをtimesfmライブラリ1.2.x形式に変換"""

import re
import torch
from safetensors.torch import load_file
from huggingface_hub import hf_hub_download
from pathlib import Path


def remap_key(old_key: str) -> str | None:
    """旧キー名を新キー名にマッピング"""

    # tokenizer → input_ff_layer
    if old_key.startswith("tokenizer."):
        rest = old_key[len("tokenizer."):]
        if rest == "hidden_layer.weight":
            return "input_ff_layer.hidden_layer.0.weight"
        if rest == "hidden_layer.bias":
            return "input_ff_layer.hidden_layer.0.bias"
        return f"input_ff_layer.{rest}"

    # output_projection_point → horizon_ff_layer
    if old_key.startswith("output_projection_point."):
        rest = old_key[len("output_projection_point."):]
        if rest == "hidden_layer.weight":
            return "horizon_ff_layer.hidden_layer.0.weight"
        if rest == "hidden_layer.bias":
            return "horizon_ff_layer.hidden_layer.0.bias"
        return f"horizon_ff_layer.{rest}"

    # output_projection_quantiles → スキップ（ライブラリ側にないので不要）
    if old_key.startswith("output_projection_quantiles."):
        return None

    # stacked_xf.N.xxx → stacked_transformer.layers.N.xxx
    m = re.match(r"stacked_xf\.(\d+)\.(.*)", old_key)
    if m:
        layer_num = m.group(1)
        rest = m.group(2)

        # attn系
        if rest == "attn.qkv_proj.weight":
            return f"stacked_transformer.layers.{layer_num}.self_attn.qkv_proj.weight"
        if rest == "attn.out.weight":
            return f"stacked_transformer.layers.{layer_num}.self_attn.o_proj.weight"
        if rest == "attn.per_dim_scale.per_dim_scale":
            return f"stacked_transformer.layers.{layer_num}.self_attn.scaling"
        if rest == "attn.key_ln.scale":
            return None  # 新アーキにはない
        if rest == "attn.query_ln.scale":
            return None  # 新アーキにはない

        # ff系
        if rest == "ff0.weight":
            return f"stacked_transformer.layers.{layer_num}.mlp.gate_proj.weight"
        if rest == "ff1.weight":
            return f"stacked_transformer.layers.{layer_num}.mlp.down_proj.weight"

        # layernorm系
        if rest == "pre_attn_ln.scale":
            return f"stacked_transformer.layers.{layer_num}.input_layernorm.weight"
        if rest == "pre_ff_ln.scale":
            return f"stacked_transformer.layers.{layer_num}.mlp.layer_norm.weight"
        if rest == "post_attn_ln.scale":
            return None  # 新アーキにはない
        if rest == "post_ff_ln.scale":
            return None  # 新アーキにはない

    return old_key  # マッピングがなければそのまま


def convert():
    print("TimesFM 2.5 重みを変換中...")

    # HuggingFaceからsafetensorsをダウンロード
    sf_path = hf_hub_download("google/timesfm-2.5-200m-pytorch", "model.safetensors")
    old_state = load_file(sf_path)

    new_state = {}
    skipped = []
    for old_key, tensor in old_state.items():
        new_key = remap_key(old_key)
        if new_key is None:
            skipped.append(old_key)
            continue
        new_state[new_key] = tensor

    print(f"変換完了: {len(new_state)}キー（{len(skipped)}キーはスキップ）")
    if skipped:
        print(f"スキップ: {skipped[:5]}...")

    # torch_model.ckpt として保存
    ckpt_dir = Path(sf_path).parent
    ckpt_path = ckpt_dir / "torch_model.ckpt"
    torch.save(new_state, ckpt_path)
    print(f"保存先: {ckpt_path}")
    return str(ckpt_path)


if __name__ == "__main__":
    convert()
