import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center border border-transparent text-xs font-bold whitespace-nowrap transition-all outline-none select-none shadow-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground active:opacity-80",
        outline:
          "bg-transparent text-[#3c3c43] border border-[#d8d8d9] active:opacity-80",
        ghost:
          "bg-transparent text-[#3c3c43] hover:bg-[#f5f5f5] active:opacity-80",
        destructive:
          "bg-[#dd0c14]/10 text-[#dd0c14] hover:bg-[#dd0c14]/20 focus-visible:border-[#dd0c14]/40 focus-visible:ring-[#dd0c14]/20",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 gap-1.5 px-4 py-2 rounded-sm",
        sm: "h-8 gap-1 px-3 rounded-sm text-xs [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 gap-1.5 px-6 rounded-sm text-sm",
        icon: "size-9 rounded-sm",
        "icon-sm": "size-7 rounded-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  render,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      render={render}
      {...(render ? { nativeButton: false } : {})}
      {...props}
    />
  )
}

export { Button, buttonVariants }
