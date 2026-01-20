# Writing Tests

Test codeunits verify that LLM-generated code works correctly. They run inside the Business Central container after successful compilation.

## Test File Structure

```al
codeunit 80001 "CG-AL-E001 Test"
{
    Subtype = Test;
    TestPermissions = Disabled;

    var
        Assert: Codeunit Assert;
        LibraryRandom: Codeunit "Library - Random";

    [Test]
    procedure TestFieldExistence()
    begin
        // Test code
    end;
}
```

### Required Elements

| Element                      | Description                 |
| ---------------------------- | --------------------------- |
| `Subtype = Test`             | Marks as test codeunit      |
| `TestPermissions = Disabled` | Allows unrestricted testing |
| `[Test]` attribute           | Marks each test procedure   |
| `Assert` codeunit            | Provides assertion methods  |

## Test Codeunit IDs

| Range       | Difficulty   |
| ----------- | ------------ |
| 80001-80099 | Easy tasks   |
| 80100-80199 | Medium tasks |
| 80200-80299 | Hard tasks   |

## Assertion Methods

The `Assert` codeunit provides:

```al
// Equality
Assert.AreEqual(Expected, Actual, ErrorMessage);
Assert.AreNotEqual(NotExpected, Actual, ErrorMessage);

// Boolean
Assert.IsTrue(Condition, ErrorMessage);
Assert.IsFalse(Condition, ErrorMessage);

// Numeric comparisons
Assert.AreNearlyEqual(Expected, Actual, Tolerance, ErrorMessage);

// String
Assert.ExpectedError(ExpectedMessage);  // With asserterror

// Records
Assert.RecordIsEmpty(Record);
Assert.RecordIsNotEmpty(Record);
Assert.RecordCount(Record, ExpectedCount);

// Tables
Assert.TableIsEmpty(TableNo);
Assert.TableIsNotEmpty(TableNo);
```

## Test Pattern

Use the GIVEN-WHEN-THEN pattern:

```al
[Test]
procedure TestDiscountCalculation()
var
    Calculator: Codeunit "Discount Calculator";
    Result: Decimal;
begin
    // [SCENARIO] Gold customers get 10% discount

    // [GIVEN] A gold customer with a $200 order
    // (No setup needed for this simple case)

    // [WHEN] Calculating the discount
    Result := Calculator.CalculateDiscount(200, 2); // Gold = 2

    // [THEN] The discount should be $20 (10%)
    Assert.AreEqual(20, Result, 'Gold customers should get 10% discount');
end;
```

## Testing Different Object Types

### Testing Tables

```al
[Test]
procedure TestTableFieldDefaults()
var
    ProductCategory: Record "Product Category";
begin
    // [SCENARIO] Active field defaults to true

    // [WHEN] Creating a new record
    ProductCategory.Init();
    ProductCategory.Code := 'TEST';
    ProductCategory.Description := 'Test Category';
    ProductCategory."Created Date" := WorkDate();
    ProductCategory.Insert(true);

    // [THEN] Active should default to true
    Clear(ProductCategory);
    ProductCategory.Get('TEST');
    Assert.IsTrue(ProductCategory.Active, 'Active should default to true');

    // Cleanup
    ProductCategory.Delete();
end;

[Test]
procedure TestTableValidation()
var
    ProductCategory: Record "Product Category";
begin
    // [SCENARIO] Code field cannot be blank

    // [WHEN] Trying to insert with blank code
    ProductCategory.Init();
    ProductCategory.Code := '';
    ProductCategory.Description := 'Test';

    // [THEN] Error should occur
    asserterror ProductCategory.Insert(true);
    Assert.ExpectedError('Code must have a value');
end;
```

### Testing Codeunits

```al
[Test]
procedure TestCalculation()
var
    Calculator: Codeunit "Tax Calculator";
    Result: Decimal;
begin
    // [SCENARIO] US tax for amount >= 1000 is 10%

    // [WHEN] Calculating tax for $1500 in US
    Result := Calculator.CalculateTax(1500, 'US', "CG Product Type"::Standard);

    // [THEN] Tax should be $150
    Assert.AreEqual(150, Result, 'US amount >= 1000 should have 10% tax');
end;

[Test]
procedure TestEdgeCaseBoundary()
var
    Calculator: Codeunit "Tax Calculator";
begin
    // [SCENARIO] Boundary at exactly $1000

    // Amount at boundary
    Assert.AreEqual(100, Calculator.CalculateTax(1000, 'US', "CG Product Type"::Standard),
        'US amount exactly 1000 should have 10% tax');

    // Amount just below
    Assert.AreEqual(69.93, Calculator.CalculateTax(999, 'US', "CG Product Type"::Standard),
        'US amount 999 should have 7% tax');
end;
```

### Testing Interfaces

Interfaces cannot be instantiated directly. Create a mock:

```al
// Mock implementation (in helper file)
codeunit 70096 "Mock Payment Processor" implements "Payment Processor"
{
    procedure ProcessPayment(Amount: Decimal; PaymentMethod: Text): Boolean
    begin
        exit(Amount > 0);
    end;

    procedure ValidatePayment(PaymentData: Text): Boolean
    begin
        exit(PaymentData <> '');
    end;
}
```

```al
// Test using the mock
[Test]
procedure TestInterfaceContract()
var
    PaymentProcessor: Interface "Payment Processor";
    MockProcessor: Codeunit "Mock Payment Processor";
begin
    // [SCENARIO] Interface can be implemented and used

    // [GIVEN] A mock implementation
    PaymentProcessor := MockProcessor;

    // [WHEN/THEN] Interface methods work correctly
    Assert.IsTrue(
        PaymentProcessor.ProcessPayment(100.00, 'Card'),
        'Should process valid payment'
    );
    Assert.IsFalse(
        PaymentProcessor.ProcessPayment(-50.00, 'Card'),
        'Should reject negative amount'
    );
end;
```

### Testing Pages

```al
[Test]
procedure TestPageOpens()
var
    ProductCategory: Record "Product Category";
    ProductCategoryCard: TestPage "Product Category Card";
begin
    // [SCENARIO] Card page opens for existing record

    // [GIVEN] An existing record
    ProductCategory.Code := 'TEST';
    ProductCategory.Description := 'Test';
    ProductCategory.Insert();

    // [WHEN] Opening the card page
    ProductCategoryCard.OpenEdit();
    ProductCategoryCard.GoToRecord(ProductCategory);

    // [THEN] Fields should display correctly
    Assert.AreEqual('TEST', ProductCategoryCard.Code.Value, 'Code should display');
    Assert.AreEqual('Test', ProductCategoryCard.Description.Value, 'Description should display');

    ProductCategoryCard.Close();
    ProductCategory.Delete();
end;
```

## Critical Testing Rules

### 1. Never Use Placeholder Assertions

```al
// BAD - Always passes
[Test]
procedure BadTest()
begin
    Assert.IsTrue(true, 'This always passes');
end;

// GOOD - Verifies actual behavior
[Test]
procedure GoodTest()
var
    Result: Decimal;
begin
    Result := Calculator.Add(2, 3);
    Assert.AreEqual(5, Result, 'Sum should be 5');
end;
```

### 2. Test All Requirements

If the task specifies behavior, test it:

```yaml
# Task description
description: >-
  Active field defaults to true.
  Code field cannot be blank.
```

```al
// Test BOTH requirements
[Test]
procedure TestActiveDefault()
begin
    // Test Active defaults to true
end;

[Test]
procedure TestCodeRequired()
begin
    // Test Code cannot be blank
end;
```

### 3. Test Boundary Conditions

If the task mentions thresholds:

```yaml
description: >-
  Tax is 7% for amounts >= 100 and < 1000
```

```al
[Test]
procedure TestJustBelowThreshold()
begin
    // 99.99 should have 0% tax
end;

[Test]
procedure TestExactlyAtThreshold()
begin
    // 100 should have 7% tax
end;

[Test]
procedure TestJustAboveThreshold()
begin
    // 100.01 should have 7% tax
end;
```

### 4. Test Edge Cases

- Negative values
- Zero values
- Empty strings
- Maximum length strings
- Unknown/invalid codes

```al
[Test]
procedure TestNegativeAmount()
var
    Result: Decimal;
begin
    Result := Calculator.CalculateDiscount(-100, 2);
    Assert.AreEqual(0, Result, 'Negative amounts should return 0');
end;

[Test]
procedure TestUnknownCountry()
var
    Result: Decimal;
begin
    Result := Calculator.CalculateTax(1000, 'XX', "CG Product Type"::Standard);
    Assert.AreEqual(0, Result, 'Unknown country should have 0% tax');
end;
```

### 5. Match Exact Error Messages

If the task specifies error text:

```yaml
description: >-
  Error message must be exactly: "Cannot delete active contract"
```

```al
[Test]
procedure TestCannotDeleteActive()
var
    Contract: Record "Service Contract";
begin
    Contract.Status := Contract.Status::Active;
    Contract.Insert();

    asserterror Contract.Delete(true);
    Assert.ExpectedError('Cannot delete active contract');
end;
```

## Test Libraries

Use standard BC test libraries:

| Library                    | Purpose                   |
| -------------------------- | ------------------------- |
| `Assert`                   | Assertions                |
| `Library - Random`         | Random test data          |
| `Library - Sales`          | Sales document helpers    |
| `Library - Purchase`       | Purchase document helpers |
| `Library - Inventory`      | Item/inventory helpers    |
| `Library - Report Dataset` | Report testing            |

```al
var
    Assert: Codeunit Assert;
    LibraryRandom: Codeunit "Library - Random";
    LibrarySales: Codeunit "Library - Sales";
```

## Cleanup

Always clean up test data:

```al
[Test]
procedure TestWithCleanup()
var
    TestRecord: Record "My Table";
begin
    // Setup
    TestRecord.Code := 'TEST';
    TestRecord.Insert();

    // Test
    // ...

    // Cleanup (even on success)
    TestRecord.Delete();
end;
```

Or use transaction rollback (test records automatically rolled back):

```al
codeunit 80001 "My Tests"
{
    Subtype = Test;
    TestPermissions = Disabled;
    TransactionIsolationLevel = Rollback;  // Auto-cleanup

    [Test]
    procedure TestWithAutoCleanup()
    begin
        // Records created here are automatically rolled back
    end;
}
```

## Complete Example

```al
codeunit 80020 "CG-AL-E020 Test"
{
    Subtype = Test;
    TestPermissions = Disabled;

    var
        Assert: Codeunit Assert;
        DiscountCalculator: Codeunit "Discount Calculator";

    [Test]
    procedure TestStandardCustomer_NoDiscount()
    var
        Result: Decimal;
    begin
        // [SCENARIO] Standard customers get no discount
        Result := DiscountCalculator.CalculateDiscount(100, 0);
        Assert.AreEqual(0, Result, 'Standard customers should get 0% discount');
    end;

    [Test]
    procedure TestSilverCustomer_5Percent()
    var
        Result: Decimal;
    begin
        // [SCENARIO] Silver customers get 5% discount
        Result := DiscountCalculator.CalculateDiscount(100, 1);
        Assert.AreEqual(5, Result, 'Silver customers should get 5% discount');
    end;

    [Test]
    procedure TestGoldCustomer_10Percent()
    var
        Result: Decimal;
    begin
        // [SCENARIO] Gold customers get 10% discount
        Result := DiscountCalculator.CalculateDiscount(200, 2);
        Assert.AreEqual(20, Result, 'Gold customers should get 10% = 20');
    end;

    [Test]
    procedure TestNegativeAmount_ReturnsZero()
    var
        Result: Decimal;
    begin
        // [SCENARIO] Negative amounts return 0
        Result := DiscountCalculator.CalculateDiscount(-100, 2);
        Assert.AreEqual(0, Result, 'Negative amounts should return 0');
    end;

    [Test]
    procedure TestZeroAmount_ReturnsZero()
    var
        Result: Decimal;
    begin
        // [SCENARIO] Zero amount returns 0 discount
        Result := DiscountCalculator.CalculateDiscount(0, 2);
        Assert.AreEqual(0, Result, 'Zero amount should return 0');
    end;
}
```

## Next Steps

- [Task Format](./task-format.md) - YAML structure
- [Task Categories](./categories.md) - Difficulty guidelines
- [Running Benchmarks](../guides/running-benchmarks.md) - Execute tests
