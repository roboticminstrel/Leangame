import Leangame.Defs
import Mathlib.Algebra.Ring.Defs

/-!
# Examples of vector spaces

* `Vec2 F`: the toy space, pairs `(x, y)` of scalars (Axler 1.12 with `n = 2`). Its operations and laws are
  written out by hand, as a model for the spaces the book builds next.
* `F` over itself: scalars are vectors too (Axler 1.24 with `n = 1`).

For `Fⁿ` and the rest of Mathlib's modules, see `Leangame.Mathlib`: every Mathlib module over a field is a
vector space here.
-/

universe u

namespace Axler

/-- The toy vector space: pairs `(x, y)` of scalars, the arrows of the plane `F²`. -/
@[ext] structure Vec2 (F : Type u) where
  x : F
  y : F

namespace Vec2

variable {F : Type u} [Field F]

/-- Addition is coordinatewise: `(x₁, y₁) + (x₂, y₂) = (x₁ + x₂, y₁ + y₂)`. -/
instance : Add (Vec2 F) := ⟨fun u v => ⟨u.x + v.x, u.y + v.y⟩⟩
instance : Zero (Vec2 F) := ⟨⟨0, 0⟩⟩
instance : Neg (Vec2 F) := ⟨fun v => ⟨-v.x, -v.y⟩⟩
/-- Scalar multiplication is coordinatewise too: `a • (x, y) = (a x, a y)`. -/
instance : SMul F (Vec2 F) := ⟨fun a v => ⟨a * v.x, a * v.y⟩⟩

@[simp] theorem add_x (u v : Vec2 F) : (u + v).x = u.x + v.x := rfl
@[simp] theorem add_y (u v : Vec2 F) : (u + v).y = u.y + v.y := rfl
@[simp] theorem zero_x : (0 : Vec2 F).x = 0 := rfl
@[simp] theorem zero_y : (0 : Vec2 F).y = 0 := rfl
@[simp] theorem neg_x (v : Vec2 F) : (-v).x = -v.x := rfl
@[simp] theorem neg_y (v : Vec2 F) : (-v).y = -v.y := rfl
@[simp] theorem smul_x (a : F) (v : Vec2 F) : (a • v).x = a * v.x := rfl
@[simp] theorem smul_y (a : F) (v : Vec2 F) : (a • v).y = a * v.y := rfl

/-- Each law holds coordinate by coordinate, because it holds for scalars. -/
instance : AddLaws (Vec2 F) where
  add_comm u v := by ext <;> simp [_root_.add_comm]
  add_assoc u v w := by ext <;> simp [_root_.add_assoc]
  add_zero v := by ext <;> simp
  add_neg_cancel v := by ext <;> simp

instance : VectorSpace F (Vec2 F) where
  mul_smul a b v := by ext <;> simp [_root_.mul_assoc]
  one_smul v := by ext <;> simp
  smul_add a u v := by ext <;> simp [_root_.mul_add]
  add_smul a b v := by ext <;> simp [_root_.add_mul]

end Vec2

section Field

variable {F : Type u} [Field F]

/-- A field is a vector space over itself: vectors are scalars, and `a • b = a * b`. -/
instance AddLaws.ofField : AddLaws F where
  add_comm := _root_.add_comm
  add_assoc := _root_.add_assoc
  add_zero := _root_.add_zero
  add_neg_cancel := _root_.add_neg_cancel

instance VectorSpace.ofField : VectorSpace F F where
  mul_smul a b v := by simp only [smul_eq_mul, _root_.mul_assoc]
  one_smul v := by simp only [smul_eq_mul, _root_.one_mul]
  smul_add a u v := by simp only [smul_eq_mul, _root_.mul_add]
  add_smul a b v := by simp only [smul_eq_mul, _root_.add_mul]

end Field

end Axler
