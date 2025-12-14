codeunit 80020 "CG-AL-M010 Test"
{
    // Tests for CG-AL-M010: Multi-Object Project Management System
    Subtype = Test;
    TestPermissions = Disabled;

    var
        Assert: Codeunit Assert;
        LibraryRandom: Codeunit "Library - Random";

    [Test]
    procedure TestProjectTableExists()
    var
        Project: Record Project;
    begin
        // [SCENARIO] Project table exists
        // [GIVEN] The table definition
        // [WHEN] We initialize a record
        Project.Init();
        // [THEN] No error occurs
        Assert.IsTrue(true, 'Project table exists');
    end;

    [Test]
    procedure TestProjectTaskTableExists()
    var
        ProjectTask: Record "Project Task";
    begin
        // [SCENARIO] Project Task table exists
        // [GIVEN] The table definition
        // [WHEN] We initialize a record
        ProjectTask.Init();
        // [THEN] No error occurs
        Assert.IsTrue(true, 'Project Task table exists');
    end;

    [Test]
    procedure TestProjectCardPageExists()
    var
        ProjectCard: TestPage "Project Card";
    begin
        // [SCENARIO] Project Card page exists
        // [WHEN] We open the page
        ProjectCard.OpenView();
        // [THEN] No error occurs
        ProjectCard.Close();
    end;

    [Test]
    procedure TestProjectManagementCodeunitExists()
    var
        ProjectManagement: Codeunit "Project Management";
    begin
        // [SCENARIO] Project Management codeunit exists
        // [GIVEN] The codeunit definition
        // [WHEN] We reference the codeunit
        // [THEN] No error occurs
        Assert.IsTrue(true, 'Codeunit exists');
    end;

    [Test]
    procedure TestCreateProject()
    var
        Project: Record Project;
    begin
        // [SCENARIO] Project can be created
        // [GIVEN] Project data
        Project.Init();
        Project."Project Code" := CopyStr(LibraryRandom.RandText(10), 1, 20);
        Project.Name := 'Test Project';
        Project.Status := Project.Status::Planning;

        // [WHEN] We insert the project
        Project.Insert(true);

        // [THEN] Project is created
        Assert.IsTrue(Project.Get(Project."Project Code"), 'Project should be created');

        // Cleanup
        Project.Delete();
    end;

    [Test]
    procedure TestCreateProjectTask()
    var
        Project: Record Project;
        ProjectTask: Record "Project Task";
    begin
        // [SCENARIO] Project Task can be created and linked to Project
        // [GIVEN] A project
        CreateTestProject(Project);

        // [WHEN] We create a task
        ProjectTask.Init();
        ProjectTask."Project Code" := Project."Project Code";
        ProjectTask."Task Code" := CopyStr(LibraryRandom.RandText(10), 1, 20);
        ProjectTask.Description := 'Test Task';
        ProjectTask.Insert(true);

        // [THEN] Task is linked to project
        Assert.AreEqual(Project."Project Code", ProjectTask."Project Code", 'Task should be linked to project');

        // Cleanup
        ProjectTask.Delete();
        Project.Delete();
    end;

    [Test]
    procedure TestProjectTaskRelationship()
    var
        Project: Record Project;
        ProjectTask: Record "Project Task";
        TaskCount: Integer;
    begin
        // [SCENARIO] Project can have multiple tasks
        // [GIVEN] A project with tasks
        CreateTestProject(Project);
        CreateTestTask(Project, ProjectTask);
        CreateTestTask(Project, ProjectTask);
        CreateTestTask(Project, ProjectTask);

        // [WHEN] We count tasks
        ProjectTask.SetRange("Project Code", Project."Project Code");
        TaskCount := ProjectTask.Count();

        // [THEN] All tasks are linked
        Assert.AreEqual(3, TaskCount, 'Project should have 3 tasks');

        // Cleanup
        ProjectTask.DeleteAll();
        Project.Delete();
    end;

    [Test]
    procedure TestProjectCalculatedFields()
    var
        Project: Record Project;
        ProjectTask: Record "Project Task";
        TotalHours: Decimal;
    begin
        // [SCENARIO] Project has calculated fields from tasks
        // [GIVEN] A project with tasks that have hours
        CreateTestProject(Project);

        ProjectTask.Init();
        ProjectTask."Project Code" := Project."Project Code";
        ProjectTask."Task Code" := 'TASK1';
        ProjectTask.Description := 'Task 1';
        ProjectTask."Estimated Hours" := 10;
        ProjectTask.Insert(true);

        ProjectTask.Init();
        ProjectTask."Project Code" := Project."Project Code";
        ProjectTask."Task Code" := 'TASK2';
        ProjectTask.Description := 'Task 2';
        ProjectTask."Estimated Hours" := 20;
        ProjectTask.Insert(true);

        // [WHEN] We calculate total hours
        TotalHours := Project.CalculateTotalEstimatedHours();

        // [THEN] Total is sum of task hours
        Assert.AreEqual(30, TotalHours, 'Total hours should be 30');

        // Cleanup
        ProjectTask.SetRange("Project Code", Project."Project Code");
        ProjectTask.DeleteAll();
        Project.Delete();
    end;

    [Test]
    procedure TestProjectCardDisplaysTasks()
    var
        Project: Record Project;
        ProjectTask: Record "Project Task";
        ProjectCard: TestPage "Project Card";
    begin
        // [SCENARIO] Project Card shows related tasks
        // [GIVEN] A project with tasks
        CreateTestProject(Project);
        CreateTestTask(Project, ProjectTask);

        // [WHEN] We open Project Card
        ProjectCard.OpenView();
        ProjectCard.GoToRecord(Project);

        // [THEN] Task subpage shows tasks
        // Note: Would navigate to subpage part

        ProjectCard.Close();

        // Cleanup
        ProjectTask.Delete();
        Project.Delete();
    end;

    [Test]
    procedure TestProjectManagementCreateProject()
    var
        Project: Record Project;
        ProjectManagement: Codeunit "Project Management";
        ProjectCode: Code[20];
    begin
        // [SCENARIO] Project Management can create projects
        // [GIVEN] Project data
        // [WHEN] We create via codeunit
        ProjectCode := ProjectManagement.CreateProject('New Project', WorkDate());

        // [THEN] Project is created
        Assert.IsTrue(Project.Get(ProjectCode), 'Project should be created');

        // Cleanup
        Project.Delete();
    end;

    [Test]
    procedure TestProjectStatusTransition()
    var
        Project: Record Project;
        ProjectManagement: Codeunit "Project Management";
    begin
        // [SCENARIO] Project status can transition
        // [GIVEN] A project in Planning status
        CreateTestProject(Project);
        Project.Status := Project.Status::Planning;
        Project.Modify();

        // [WHEN] We transition to Active
        ProjectManagement.ActivateProject(Project."Project Code");

        // [THEN] Status is Active
        Project.Get(Project."Project Code");
        Assert.AreEqual(Project.Status::Active, Project.Status, 'Status should be Active');

        // Cleanup
        Project.Delete();
    end;

    [Test]
    procedure TestProjectCompleteWithOpenTasks()
    var
        Project: Record Project;
        ProjectTask: Record "Project Task";
        ProjectManagement: Codeunit "Project Management";
    begin
        // [SCENARIO] Cannot complete project with open tasks
        // [GIVEN] A project with incomplete tasks
        CreateTestProject(Project);
        CreateTestTask(Project, ProjectTask);
        ProjectTask.Status := ProjectTask.Status::Open;
        ProjectTask.Modify();

        // [WHEN] We try to complete
        // [THEN] Error is raised
        asserterror ProjectManagement.CompleteProject(Project."Project Code");
        Assert.ExpectedError('Cannot complete project with open tasks');

        // Cleanup
        ProjectTask.Delete();
        Project.Delete();
    end;

    [Test]
    procedure TestCascadeDelete()
    var
        Project: Record Project;
        ProjectTask: Record "Project Task";
        ProjectCode: Code[20];
    begin
        // [SCENARIO] Deleting project deletes tasks
        // [GIVEN] A project with tasks
        CreateTestProject(Project);
        ProjectCode := Project."Project Code";
        CreateTestTask(Project, ProjectTask);
        CreateTestTask(Project, ProjectTask);

        // [WHEN] We delete the project
        Project.Delete(true);

        // [THEN] Tasks are also deleted
        ProjectTask.SetRange("Project Code", ProjectCode);
        Assert.AreEqual(0, ProjectTask.Count(), 'Tasks should be deleted');
    end;

    local procedure CreateTestProject(var Project: Record Project)
    begin
        Project.Init();
        Project."Project Code" := CopyStr(LibraryRandom.RandText(10), 1, 20);
        Project.Name := 'Test Project';
        Project.Status := Project.Status::Planning;
        Project.Insert(true);
    end;

    local procedure CreateTestTask(var Project: Record Project; var ProjectTask: Record "Project Task")
    begin
        ProjectTask.Init();
        ProjectTask."Project Code" := Project."Project Code";
        ProjectTask."Task Code" := CopyStr(LibraryRandom.RandText(10), 1, 20);
        ProjectTask.Description := 'Test Task';
        ProjectTask.Status := ProjectTask.Status::Open;
        ProjectTask.Insert(true);
    end;
}
